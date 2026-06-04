import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use the mocked modules
// ---------------------------------------------------------------------------

// Mock the LLM module so ingest never calls the real API
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(),
}));

// Mock the YouTube module
vi.mock("../youtube", () => ({
  isYouTubeUrl: vi.fn(() => false),
  fetchYouTubeContent: vi.fn(),
}));

// Mock unpdf (required by ingest pipeline)
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { ingestUrl, ingestYouTube } from "../ingest";
import { listWikiPages, readWikiPageWithFrontmatter } from "../wiki";
import { parseSources } from "../sources";
import { resetSourceIndex } from "../source-index";
import { resetAliasIndex } from "../alias-index";
import { isYouTubeUrl, fetchYouTubeContent } from "../youtube";
import { hasLLMKey } from "../llm";

const mockedIsYouTubeUrl = vi.mocked(isYouTubeUrl);
const mockedFetchYouTubeContent = vi.mocked(fetchYouTubeContent);
const mockedHasLLMKey = vi.mocked(hasLLMKey);

// ---------------------------------------------------------------------------
// Temp directory setup (same pattern as ingest.test.ts)
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-yt-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");

  // Reset in-memory indexes
  resetSourceIndex();
  resetAliasIndex();

  // Default: no LLM key (fallback synthesis)
  mockedHasLLMKey.mockReturnValue(false);
});

afterEach(async () => {
  if (originalWikiDir === undefined) {
    delete process.env.WIKI_DIR;
  } else {
    process.env.WIKI_DIR = originalWikiDir;
  }
  if (originalRawDir === undefined) {
    delete process.env.RAW_DIR;
  } else {
    process.env.RAW_DIR = originalRawDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("YouTube ingest routing", () => {
  it("routes YouTube URLs through ingestYouTube when isYouTubeUrl returns true", async () => {
    mockedIsYouTubeUrl.mockReturnValue(true);
    mockedFetchYouTubeContent.mockResolvedValue({
      title: "Test Video",
      content: "# Test Video\n\nThis is a transcript of the video.",
    });

    const result = await ingestUrl("https://www.youtube.com/watch?v=abc123");

    expect(result.wikiPages).toContain("test-video");
    expect(result.indexUpdated).toBe(true);
    expect(mockedFetchYouTubeContent).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    );

    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0].slug).toBe("test-video");
  });

  it("does NOT route non-YouTube URLs through fetchYouTubeContent", async () => {
    mockedIsYouTubeUrl.mockReturnValue(false);

    // Mock global fetch for the normal URL path
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () =>
        Promise.resolve(
          "<html><head><title>Normal Page</title></head><body><p>Content here.</p></body></html>",
        ),
    });

    try {
      const result = await ingestUrl("https://example.com/article");
      expect(result.wikiPages).toContain("normal-page");
      expect(mockedFetchYouTubeContent).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("YouTube source type verification", () => {
  it("records source type as 'youtube' in page frontmatter", async () => {
    mockedIsYouTubeUrl.mockReturnValue(true);
    mockedFetchYouTubeContent.mockResolvedValue({
      title: "Source Type Check",
      content: "# Source Type Check\n\nTranscript content for verification.",
    });

    const result = await ingestUrl("https://youtu.be/xyz789");
    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page).not.toBeNull();

    const sources = parseSources(page!.frontmatter.sources);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe("youtube");
    expect(sources[0].url).toBe("https://youtu.be/xyz789");
  });
});

describe("YouTube ingest dedup", () => {
  it("deduplicates a second ingest of the same YouTube URL", async () => {
    mockedIsYouTubeUrl.mockReturnValue(true);
    mockedFetchYouTubeContent.mockResolvedValue({
      title: "Dedup Video",
      content: "# Dedup Video\n\nTranscript for dedup test.",
    });

    // First ingest — creates the page
    const first = await ingestUrl("https://www.youtube.com/watch?v=dedup1");
    expect(first.wikiPages).toContain("dedup-video");
    expect(mockedFetchYouTubeContent).toHaveBeenCalledTimes(1);

    // Reset source index so it rebuilds from disk (simulates a fresh process)
    resetSourceIndex();

    // Second ingest — same URL should dedup
    const second = await ingestUrl("https://www.youtube.com/watch?v=dedup1");
    expect(second.deduped).toBe(true);
    expect(second.primarySlug).toBe("dedup-video");
    // fetchYouTubeContent should NOT have been called a second time
    // because the dedup check fires before the YouTube routing
    expect(mockedFetchYouTubeContent).toHaveBeenCalledTimes(1);

    // Only one page exists
    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
  });
});

describe("ingestYouTube direct call", () => {
  it("creates a page with youtube provenance when called directly", async () => {
    mockedFetchYouTubeContent.mockResolvedValue({
      title: "Direct Call Video",
      content: "# Direct Call Video\n\nDirect transcript.",
    });

    const result = await ingestYouTube("https://www.youtube.com/watch?v=direct");
    expect(result.wikiPages).toContain("direct-call-video");
    expect(result.indexUpdated).toBe(true);

    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page).not.toBeNull();
    const sources = parseSources(page!.frontmatter.sources);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe("youtube");
    expect(sources[0].url).toBe("https://www.youtube.com/watch?v=direct");
  });
});
