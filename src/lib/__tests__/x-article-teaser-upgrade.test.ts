import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// No LLM key → ingest stores content as-is (no synthesis). Keeps this test about
// the dedup teaser-upgrade CONTROL FLOW (re-fetch + re-ingest vs plain attach),
// not about LLM distillation.
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(),
}));

// Partial-mock x-post: keep the REAL teaser detection (isXArticleTeaser,
// X_ARTICLE_TEASER_NOTE) so we test the actual contract, but control whether a
// URL is treated as an X post and what the fetch returns (teaser vs full body).
vi.mock("../x-post", async (orig) => {
  const actual = await orig<typeof import("../x-post")>();
  return {
    ...actual,
    isXPostUrl: vi.fn(),
    fetchXPostContent: vi.fn(),
  };
});

import { ingestUrl } from "../ingest";
import { readWikiPageWithFrontmatter, listWikiPages } from "../wiki";
import { resetSourceIndex } from "../source-index";
import {
  isXPostUrl,
  fetchXPostContent,
  X_ARTICLE_TEASER_NOTE,
} from "../x-post";

const mockedIsXPostUrl = vi.mocked(isXPostUrl);
const mockedFetch = vi.mocked(fetchXPostContent);

const X_URL = "https://x.com/richardzphotoz/status/2068368840891994142";
const TITLE = "Richard's Photography Essay";

// A teaser body carries the real sentinel line (so the REAL isXArticleTeaser
// recognizes it); the full body does not.
const TEASER_BODY = [
  `# ${TITLE}`,
  "",
  "This is just the first sentence of the essay…",
  "",
  X_ARTICLE_TEASER_NOTE,
  "",
  `**Source:** [${X_URL}](${X_URL})`,
].join("\n");

const FULL_BODY = [
  `# ${TITLE}`,
  "",
  "This is the complete article body with several paragraphs of real",
  "content that the X API returned once the bearer token was in place.",
  "It covers composition, light, and the craft of street photography.",
  "",
  `**Source:** [${X_URL}](${X_URL})`,
].join("\n");

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-teaser-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  resetSourceIndex();
  mockedIsXPostUrl.mockReset();
  mockedFetch.mockReset();
});

afterEach(async () => {
  if (originalWikiDir === undefined) delete process.env.WIKI_DIR;
  else process.env.WIKI_DIR = originalWikiDir;
  if (originalRawDir === undefined) delete process.env.RAW_DIR;
  else process.env.RAW_DIR = originalRawDir;
  await fs.rm(tmpDir, { recursive: true, force: true });
  resetSourceIndex();
});

describe("X Article teaser auto-upgrade on re-ingest", () => {
  it("re-saving a teaser page rewrites it in place once the full body is available", async () => {
    mockedIsXPostUrl.mockReturnValue(true);

    // First save: API can't serve the body yet → a teaser page lands.
    mockedFetch.mockResolvedValueOnce({ title: TITLE, content: TEASER_BODY });
    const first = await ingestUrl(X_URL);
    const slug = first.primarySlug;
    const teaserPage = await readWikiPageWithFrontmatter(slug);
    expect(teaserPage?.body).toContain("Article preview only");

    // Second save of the SAME url: dedup would normally freeze the teaser, but
    // now the fetch returns the full body → the page upgrades in place.
    mockedFetch.mockResolvedValueOnce({ title: TITLE, content: FULL_BODY });
    const second = await ingestUrl(X_URL);

    // Same canonical page (pinSlug), no second page created.
    expect(second.primarySlug).toBe(slug);
    const pages = await listWikiPages();
    expect(pages.filter((p) => p.slug === slug)).toHaveLength(1);

    // Body is now the full article, teaser sentinel gone.
    const upgraded = await readWikiPageWithFrontmatter(slug);
    expect(upgraded?.body).not.toContain("Article preview only");
    expect(upgraded?.body).toContain("complete article body");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("re-saving a perma-teaser leaves the page as a teaser (plain attach, no rewrite)", async () => {
    mockedIsXPostUrl.mockReturnValue(true);

    // First save → teaser.
    mockedFetch.mockResolvedValueOnce({ title: TITLE, content: TEASER_BODY });
    const first = await ingestUrl(X_URL);
    const slug = first.primarySlug;

    // Second save: still a teaser (out-of-window / token rejected). The dedup
    // re-fetches (cheap) but, finding no full body, falls through to attach —
    // the page is NOT rewritten.
    mockedFetch.mockResolvedValueOnce({ title: TITLE, content: TEASER_BODY });
    const second = await ingestUrl(X_URL);

    expect(second.primarySlug).toBe(slug);
    const page = await readWikiPageWithFrontmatter(slug);
    expect(page?.body).toContain("Article preview only");
    // It DID re-fetch (the upgrade probe), it just didn't find a full body.
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("does not probe non-teaser X pages on re-ingest (already full → plain attach)", async () => {
    mockedIsXPostUrl.mockReturnValue(true);

    // First save lands a FULL page.
    mockedFetch.mockResolvedValueOnce({ title: TITLE, content: FULL_BODY });
    const first = await ingestUrl(X_URL);
    const slug = first.primarySlug;
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // Re-save: dedup sees a non-teaser page → attaches without a re-fetch.
    const second = await ingestUrl(X_URL);
    expect(second.primarySlug).toBe(slug);
    expect(mockedFetch).toHaveBeenCalledTimes(1); // no upgrade probe
  });
});
