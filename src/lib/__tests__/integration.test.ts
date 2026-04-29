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
import { ingest } from "../ingest";
import { query } from "../query";
import { listWikiPages, readWikiPage } from "../wiki";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------
let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "integration-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");

  mockedHasLLMKey.mockReturnValue(true);
  mockedCallLLM.mockReset();
});

afterEach(async () => {
  if (originalWikiDir === undefined) delete process.env.WIKI_DIR;
  else process.env.WIKI_DIR = originalWikiDir;
  if (originalRawDir === undefined) delete process.env.RAW_DIR;
  else process.env.RAW_DIR = originalRawDir;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------
describe("ingest → query integration", () => {
  it("ingest text then query retrieves it", async () => {
    // 1st callLLM: ingest generates wiki content
    mockedCallLLM.mockResolvedValueOnce(
      "# Photosynthesis\n\n## Summary\n\nPhotosynthesis converts sunlight into chemical energy in plants.\n\n## Key Points\n\n- Uses chlorophyll\n- Produces oxygen",
    );
    // No cross-ref call expected (empty wiki when first page ingested)

    const result = await ingest(
      "Photosynthesis",
      "Photosynthesis is the process by which plants convert sunlight into chemical energy. It occurs in chloroplasts using chlorophyll.",
    );

    expect(result.wikiPages.length).toBeGreaterThanOrEqual(1);
    expect(result.primarySlug).toBe("photosynthesis");

    // Verify the page appears in the index
    const pages = await listWikiPages();
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("photosynthesis");

    // 2nd callLLM: query answer (small wiki ≤5 pages, no re-ranking)
    mockedCallLLM.mockResolvedValueOnce(
      "Plants make energy through [Photosynthesis](photosynthesis.md), which converts sunlight into chemical energy using chlorophyll.",
    );

    const qr = await query("How do plants make energy?");
    expect(qr.answer).toBeTruthy();
    expect(qr.answer.length).toBeGreaterThan(0);
    expect(qr.sources).toContain("photosynthesis");
  });

  it("ingesting two sources creates both pages", async () => {
    // 1st ingest: Photosynthesis
    mockedCallLLM.mockResolvedValueOnce(
      "# Photosynthesis\n\n## Summary\n\nPhotosynthesis converts sunlight into energy.\n\n## Key Points\n\n- Occurs in chloroplasts\n- Requires chlorophyll",
    );

    await ingest(
      "Photosynthesis",
      "Photosynthesis is the process plants use to convert light into food.",
    );

    // 2nd ingest: Chlorophyll
    // First callLLM for this ingest: wiki content generation
    mockedCallLLM.mockResolvedValueOnce(
      "# Chlorophyll\n\n## Summary\n\nChlorophyll is the green pigment in plants essential for photosynthesis.\n\n## Key Points\n\n- Absorbs light\n- Found in chloroplasts",
    );
    // Second callLLM for this ingest: findRelatedPages cross-ref
    // (now there's 1 existing page, so cross-ref LLM is called)
    mockedCallLLM.mockResolvedValueOnce('["photosynthesis"]');

    await ingest(
      "Chlorophyll",
      "Chlorophyll is the green pigment responsible for absorbing light during photosynthesis.",
    );

    const pages = await listWikiPages();
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("photosynthesis");
    expect(slugs).toContain("chlorophyll");

    // Verify the second page was actually written with content
    const page = await readWikiPage("chlorophyll");
    expect(page).not.toBeNull();
    expect(page!.content.length).toBeGreaterThan(0);
  });

  it("query on empty wiki returns appropriate message", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    const result = await query("anything");

    // Empty wiki returns a helpful message without calling the LLM
    expect(result.answer).toMatch(/empty/i);
    expect(result.sources).toEqual([]);
  });
});
