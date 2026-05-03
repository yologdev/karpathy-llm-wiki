import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Mock LLM and embeddings — real filesystem, fake AI
// ---------------------------------------------------------------------------
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => true),
  callLLM: vi.fn(async () => "mocked"),
}));

vi.mock("../embeddings", () => ({
  searchByVector: vi.fn(async () => []),
  upsertEmbedding: vi.fn(async () => {}),
  removeEmbedding: vi.fn(async () => {}),
}));

import { hasLLMKey, callLLM } from "../llm";
import { ingestXMention } from "../ingest";
import { readWikiPageWithFrontmatter, listWikiPages } from "../wiki";
import { parseSources } from "../sources";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------
let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;
let originalFetch: typeof global.fetch;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-mention-integration-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");

  mockedHasLLMKey.mockReturnValue(true);
  mockedCallLLM.mockReset();

  // Save original fetch
  originalFetch = global.fetch;
});

afterEach(async () => {
  if (originalWikiDir === undefined) delete process.env.WIKI_DIR;
  else process.env.WIKI_DIR = originalWikiDir;
  if (originalRawDir === undefined) delete process.env.RAW_DIR;
  else process.env.RAW_DIR = originalRawDir;

  // Restore original fetch
  global.fetch = originalFetch;

  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock fetch that returns an HTML page with given title and body. */
function mockFetchSuccess(title: string, body: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Map([
      ["content-type", "text/html"],
    ]) as unknown as Headers,
    body: {
      getReader: () => {
        let called = false;
        return {
          read: () => {
            if (!called) {
              called = true;
              return Promise.resolve({
                done: false,
                value: new TextEncoder().encode(
                  `<html><head><title>${title}</title></head><body><p>${body}</p></body></html>`,
                ),
              });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
          cancel: vi.fn(),
        };
      },
    },
  });
}

/** Create a mock fetch that returns a non-ok response (e.g. 404). */
function mockFetchFailure(status: number, statusText: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    headers: new Map([
      ["content-type", "text/html"],
    ]) as unknown as Headers,
  });
}

/** Create a mock fetch that throws a network error. */
function mockFetchNetworkError(message: string) {
  global.fetch = vi.fn().mockRejectedValue(new Error(message));
}

// ---------------------------------------------------------------------------
// X-mention integration tests
// ---------------------------------------------------------------------------

describe("X-mention integration", () => {
  it("creates wiki page with x-mention source provenance", async () => {
    // Mock fetch to return article content from the X URL
    mockFetchSuccess(
      "Interesting AI Thread",
      "Large language models are transforming how we build software. They enable natural language interfaces for complex tasks.",
    );

    // Mock LLM to return wiki content for the ingest
    mockedCallLLM.mockResolvedValueOnce(
      "# Interesting AI Thread\n\n## Summary\n\nLLMs are transforming software development.\n\n## Key Points\n\n- Natural language interfaces\n- Complex task automation",
    );

    const result = await ingestXMention(
      "https://x.com/someuser/status/123456",
      "@researcher",
    );

    // Verify result shape
    expect(result.primarySlug).toBe("interesting-ai-thread");
    expect(result.wikiPages).toContain("interesting-ai-thread");
    expect(result.indexUpdated).toBe(true);
    expect(result.sourceUrl).toBe("https://x.com/someuser/status/123456");

    // Verify the wiki page was created on disk
    const page = await readWikiPageWithFrontmatter("interesting-ai-thread");
    expect(page).not.toBeNull();
    expect(page!.body).toContain("LLMs are transforming");

    // Verify frontmatter has correct source provenance
    const sources = parseSources(page!.frontmatter.sources as string);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe("x-mention");
    expect(sources[0].url).toBe("https://x.com/someuser/status/123456");
    expect(sources[0].triggered_by).toBe("@researcher");
    expect(sources[0].fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify source_url is persisted in frontmatter
    expect(page!.frontmatter.source_url).toBe(
      "https://x.com/someuser/status/123456",
    );

    // Verify the page appears in the wiki index
    const pages = await listWikiPages();
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("interesting-ai-thread");
  });

  it("creates wiki page with system authors on fresh ingest", async () => {
    mockFetchSuccess(
      "Agent Memory Systems",
      "Modern AI agents need persistent memory to maintain context across sessions.",
    );

    mockedCallLLM.mockResolvedValueOnce(
      "# Agent Memory Systems\n\n## Summary\n\nAgents need persistent memory.\n\n## Key Points\n\n- Context across sessions",
    );

    await ingestXMention(
      "https://x.com/aidev/status/789",
      "@yoyo",
    );

    const page = await readWikiPageWithFrontmatter("agent-memory-systems");
    expect(page).not.toBeNull();

    // Authors defaults to ["system"] on new pages
    expect(page!.frontmatter.authors).toEqual(["system"]);
    // Confidence defaults to 0.7
    expect(page!.frontmatter.confidence).toBe(0.7);
  });

  it("handles fetch failure (404) gracefully", async () => {
    mockFetchFailure(404, "Not Found");

    await expect(
      ingestXMention("https://x.com/user/status/999", "@someone"),
    ).rejects.toThrow(/404/);
  });

  it("handles network error gracefully", async () => {
    mockFetchNetworkError("getaddrinfo ENOTFOUND x.com");

    await expect(
      ingestXMention("https://x.com/user/status/000", "@someone"),
    ).rejects.toThrow(/ENOTFOUND/);
  });

  it("preserves twitter.com URLs as source provenance", async () => {
    mockFetchSuccess(
      "Legacy Twitter Post",
      "This was posted on the old twitter.com domain.",
    );

    mockedCallLLM.mockResolvedValueOnce(
      "# Legacy Twitter Post\n\n## Summary\n\nA post from the twitter.com era.\n\n## Key Points\n\n- Historical reference",
    );

    const result = await ingestXMention(
      "https://twitter.com/olduser/status/111",
      "@archivist",
    );

    expect(result.primarySlug).toBe("legacy-twitter-post");

    const page = await readWikiPageWithFrontmatter("legacy-twitter-post");
    expect(page).not.toBeNull();

    const sources = parseSources(page!.frontmatter.sources as string);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe("x-mention");
    expect(sources[0].url).toBe("https://twitter.com/olduser/status/111");
    expect(sources[0].triggered_by).toBe("@archivist");
  });

  it("raw source file is saved alongside wiki page", async () => {
    mockFetchSuccess(
      "Raw Source Check",
      "Content that should also be saved as a raw source document.",
    );

    mockedCallLLM.mockResolvedValueOnce(
      "# Raw Source Check\n\n## Summary\n\nRaw source verification.\n\n## Key Points\n\n- File exists",
    );

    const result = await ingestXMention(
      "https://x.com/dev/status/222",
      "@tester",
    );

    // Verify the raw source was saved
    expect(result.rawPath).toBeTruthy();
    const rawExists = await fs
      .access(result.rawPath)
      .then(() => true)
      .catch(() => false);
    expect(rawExists).toBe(true);
  });
});
