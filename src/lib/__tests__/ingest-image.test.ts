import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// LLM off — ingestImage writes a prebuilt body so the LLM is skipped anyway.
vi.mock("../llm", () => ({ hasLLMKey: vi.fn(() => false), callLLM: vi.fn() }));
// Vision is mocked (no Workers AI binding in tests).
vi.mock("../vision", () => ({ describeImage: vi.fn() }));
// Keep the real fetch module but stub the network-touching image helpers.
vi.mock("../fetch", async (orig) => {
  const actual = await orig<typeof import("../fetch")>();
  return { ...actual, fetchImageBytes: vi.fn(), storeImageBytes: vi.fn() };
});

import { ingest, ingestImage } from "../ingest";
import { hasLLMKey, callLLM } from "../llm";
import { describeImage } from "../vision";
import { fetchImageBytes, storeImageBytes } from "../fetch";
import { readWikiPageWithFrontmatter, readRawSourceById } from "../wiki";
import { parseSources } from "../sources";
import { resetSourceIndex } from "../source-index";
import { resetAliasIndex } from "../alias-index";
import { _resetStorage } from "../storage";

const mockedDescribe = vi.mocked(describeImage);
const mockedFetchBytes = vi.mocked(fetchImageBytes);
const mockedStoreBytes = vi.mocked(storeImageBytes);
const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-image-"));
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) saved[k] = process.env[k];
  process.env.DATA_DIR = tmpDir;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  _resetStorage(); // re-root storage at this test's fresh tmpDir (avoid cross-test bleed)
  resetSourceIndex();
  resetAliasIndex();
  vi.clearAllMocks();
  mockedFetchBytes.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]).buffer,
    filename: "photo.png",
    contentType: "image/png",
  });
  // localPath reflects the final (vision/title-derived) slug.
  mockedStoreBytes.mockImplementation(async (_bytes, slug, fname) => ({
    localPath: `assets/${slug}/${fname}`,
    filename: fname,
  }));
});

afterEach(async () => {
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ingestImage", () => {
  it("creates a page embedding the image + vision description, attributed to the owner with sourceType image", async () => {
    mockedDescribe.mockResolvedValue({ text: "A red square on white." });

    const result = await ingestImage(
      { imageUrl: "https://example.com/photo.png" },
      { author: "alice", owner: "alice", triggeredBy: "alice", title: "My Photo" },
    );

    expect(mockedFetchBytes).toHaveBeenCalledWith("https://example.com/photo.png");
    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).toContain("![My Photo](assets/my-photo/photo.png)");
    expect(page!.content).toContain("A red square on white.");
    expect(page!.frontmatter.owner).toBe("alice");
    expect(page!.frontmatter.source_url).toBe("https://example.com/photo.png");
    const sources = parseSources(page!.frontmatter.sources as string);
    expect(sources[0]?.type).toBe("image");
  });

  it("still creates an image-only page when vision is unavailable (fail-soft)", async () => {
    mockedDescribe.mockResolvedValue(null);

    const result = await ingestImage(
      { imageUrl: "https://example.com/photo.png" },
      { author: "bob", owner: "bob", title: "Diagram" },
    );

    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).toContain("![Diagram](assets/diagram/photo.png)");
    // No description paragraph, but the page exists and embeds the image.
    expect(page!.content.trim().endsWith("(assets/diagram/photo.png)")).toBe(true);
  });

  it("does not duplicate the embedded image in a ## Images section", async () => {
    mockedDescribe.mockResolvedValue({ text: "desc" });
    const result = await ingestImage(
      { imageUrl: "https://example.com/photo.png" },
      { author: "alice", owner: "alice", title: "Once" },
    );
    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    const occurrences = page!.content.split("assets/once/photo.png").length - 1;
    expect(occurrences).toBe(1);
    expect(page!.content).not.toContain("## Images");
  });

  it("titles the page from the vision text when no title is given (not the random filename)", async () => {
    mockedFetchBytes.mockResolvedValue({
      bytes: new Uint8Array([1]).buffer,
      filename: "HI6bsa_a0AAqUJC.jpeg", // random upload name
      contentType: "image/jpeg",
    });
    mockedDescribe.mockResolvedValue({
      text: "模型 + 手脚架 = 智能体\n\nA blue advertisement for an agent harness.",
    });

    const result = await ingestImage(
      { imageUrl: "https://example.com/x.jpeg" },
      { author: "alice", owner: "alice" }, // no title
    );

    // Slug derived from the transcribed first line, not "hi6bsa-a0aaqujc".
    expect(result.primarySlug).not.toBe("hi6bsa-a0aaqujc");
    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).toContain("模型 + 手脚架 = 智能体");
  });
});

describe("source images → dropped (ingest, LLM path)", () => {
  it("drops source images: body is image-free with no ## Figures; raw keeps the original refs", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    // The synthesizer is fed image-free text and returns clean prose.
    mockedCallLLM.mockResolvedValue(
      "# Doc\n\n## Summary\n\nDistilled.\n\n## Details\n\nMore.",
    );

    const result = await ingest(
      "Doc With Pics",
      "Some text.\n\n![a chart](assets/doc/chart.png)\n\nmore text.",
      { author: "alice", owner: "alice" },
    );

    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    // No gallery, and no image anywhere in the page body.
    expect(page!.content).not.toContain("## Figures");
    expect(page!.content).not.toContain("chart.png");
    // No re-hosting: source images are never fetched or stored to R2.
    expect(mockedFetchBytes).not.toHaveBeenCalled();
    expect(mockedStoreBytes).not.toHaveBeenCalled();

    // Invariant: the RAW source is untouched — it keeps the original image ref.
    const rawId = parseSources(page!.frontmatter.sources as string)[0]?.raw_id;
    const raw = await readRawSourceById(result.primarySlug, rawId!);
    expect(raw.content).toContain("![a chart](assets/doc/chart.png)");
  });

  it("no-LLM-key fallback also drops images (no gallery, body image-free)", async () => {
    mockedHasLLMKey.mockReturnValue(false);

    const result = await ingest(
      "Doc Fallback",
      "Some prose.\n\n![a chart](assets/doc/chart.png)\n\nmore prose.",
      { author: "alice", owner: "alice" },
    );

    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).not.toContain("## Figures");
    expect(page!.content).not.toContain("chart.png");
    expect(page!.content).toContain("Some prose.");
  });
});

describe("source provenance — text-paste supersession", () => {
  it("a real source URL replaces a prior text-paste placeholder of the same type", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("# X\n\n## Summary\n\nv1.");
    // First ingest with no URL → an x-mention source with a "text-paste" placeholder.
    await ingest("Recur Src", "version one content here", {
      sourceType: "x-mention",
      author: "a",
      owner: "a",
    });

    mockedCallLLM.mockResolvedValue("# X\n\n## Summary\n\nv2.");
    // Re-ingest (changed content) now WITH the real article URL.
    const r = await ingest("Recur Src", "version two content, changed", {
      sourceType: "x-mention",
      sourceUrl: "https://x.com/i/status/123",
      author: "a",
      owner: "a",
    });

    const page = await readWikiPageWithFrontmatter(r.primarySlug);
    const sources = parseSources(page!.frontmatter.sources as string);
    // The stale text-paste is gone; only the real URL remains.
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ type: "x-mention", url: "https://x.com/i/status/123" });
  });
});
