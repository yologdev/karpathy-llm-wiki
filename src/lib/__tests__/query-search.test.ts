import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { IndexEntry } from "../types";

// ---------------------------------------------------------------------------
// Mock LLM and embeddings (same pattern as query.test.ts)
// ---------------------------------------------------------------------------
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(async () => "mocked response"),
}));

vi.mock("../embeddings", () => ({
  searchByVector: vi.fn(async () => []),
  upsertEmbedding: vi.fn(async () => {}),
  removeEmbedding: vi.fn(async () => {}),
}));

import { hasLLMKey } from "../llm";
import { searchByVector } from "../embeddings";
import {
  selectPagesForQuery,
  searchIndex,
  buildContext,
} from "../query-search";
import { writeWikiPage, ensureDirectories } from "../wiki";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedSearchByVector = vi.mocked(searchByVector);

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------
let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;
let originalDataDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "query-search-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  originalDataDir = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;

  mockedHasLLMKey.mockReturnValue(false);
  mockedSearchByVector.mockReset();
  mockedSearchByVector.mockResolvedValue([]);
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
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// selectPagesForQuery — scoped search
// ---------------------------------------------------------------------------
describe("selectPagesForQuery — scoped search", () => {
  it("returns all entries when no scopeSlugs provided (small wiki)", async () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha page about neural networks" },
      { slug: "beta", title: "Beta", summary: "Beta page about transformers" },
      { slug: "gamma", title: "Gamma", summary: "Gamma page about attention" },
    ];
    const result = await selectPagesForQuery("neural networks", entries);
    // Small wiki (≤5 pages) returns all slugs
    expect(result).toEqual(["alpha", "beta", "gamma"]);
  });

  it("restricts returned slugs to scopeSlugs when provided", async () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha neural networks" },
      { slug: "beta", title: "Beta", summary: "Beta transformers" },
      { slug: "gamma", title: "Gamma", summary: "Gamma attention" },
      { slug: "delta", title: "Delta", summary: "Delta embeddings" },
    ];
    const result = await selectPagesForQuery("neural networks", entries, ["alpha", "gamma"]);
    // Only alpha and gamma are in scope — small filtered set returns all
    expect(result).toEqual(["alpha", "gamma"]);
    expect(result).not.toContain("beta");
    expect(result).not.toContain("delta");
  });

  it("returns empty array when scopeSlugs filters out all entries", async () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha neural networks" },
      { slug: "beta", title: "Beta", summary: "Beta transformers" },
    ];
    // Scope slugs that don't match any entries
    const result = await selectPagesForQuery("anything", entries, ["nonexistent", "missing"]);
    expect(result).toEqual([]);
  });

  it("handles empty scopeSlugs array (returns nothing)", async () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha page" },
    ];
    const result = await selectPagesForQuery("anything", entries, []);
    expect(result).toEqual([]);
  });

  it("handles scope referencing deleted pages gracefully", async () => {
    // Agent references pages that no longer exist in the index
    const entries: IndexEntry[] = [
      { slug: "existing-page", title: "Existing", summary: "Exists" },
    ];
    // scopeSlugs include a page that's in entries and one that isn't
    const result = await selectPagesForQuery("anything", entries, ["existing-page", "deleted-page"]);
    // Only the existing page is returned
    expect(result).toEqual(["existing-page"]);
  });

  it("works with larger wikis using BM25 scoring within scope", async () => {
    // Create enough entries to exceed SMALL_WIKI_THRESHOLD (5)
    const entries: IndexEntry[] = [
      { slug: "nn", title: "Neural Networks", summary: "Deep learning neural network architectures" },
      { slug: "transformers", title: "Transformers", summary: "Transformer architecture attention" },
      { slug: "cnn", title: "CNN", summary: "Convolutional neural networks for images" },
      { slug: "rnn", title: "RNN", summary: "Recurrent neural networks for sequences" },
      { slug: "gan", title: "GAN", summary: "Generative adversarial networks" },
      { slug: "vae", title: "VAE", summary: "Variational autoencoders" },
      { slug: "bert", title: "BERT", summary: "Bidirectional encoder representations from transformers" },
    ];

    // Scope to only 3 pages — filtered set is small enough to return all
    const scoped = await selectPagesForQuery("neural networks", entries, ["nn", "cnn", "rnn"]);
    expect(scoped.length).toBeLessThanOrEqual(3);
    for (const slug of scoped) {
      expect(["nn", "cnn", "rnn"]).toContain(slug);
    }
  });

  it("uses BM25 ranking within a large scope", async () => {
    // Create >5 entries all in scope to force BM25 ranking
    const entries: IndexEntry[] = Array.from({ length: 8 }, (_, i) => ({
      slug: `page-${i}`,
      title: `Page ${i}`,
      summary: i === 0 ? "neural networks deep learning" : `topic ${i} unrelated content`,
    }));
    const allSlugs = entries.map((e) => e.slug);

    // Scope includes all pages; since >5 pages, BM25 kicks in
    const result = await selectPagesForQuery("neural networks", entries, allSlugs);
    // The page about neural networks should be ranked first
    expect(result[0]).toBe("page-0");
  });
});

// ---------------------------------------------------------------------------
// buildContext — with scoped pages
// ---------------------------------------------------------------------------
describe("buildContext — scoped pages", () => {
  it("returns context only from specified slugs", async () => {
    await ensureDirectories();
    await writeWikiPage("alpha", "# Alpha\n\nAlpha content about AI.");
    await writeWikiPage("beta", "# Beta\n\nBeta content about ML.");
    await writeWikiPage("gamma", "# Gamma\n\nGamma content about NLP.");

    const { context, slugs } = await buildContext(["alpha", "gamma"]);
    expect(slugs).toEqual(["alpha", "gamma"]);
    expect(context).toContain("Alpha content");
    expect(context).toContain("Gamma content");
    expect(context).not.toContain("Beta content");
  });

  it("skips slugs for pages that don't exist on disk", async () => {
    await ensureDirectories();
    await writeWikiPage("real", "# Real\n\nReal content.");

    const { context, slugs } = await buildContext(["real", "nonexistent"]);
    expect(slugs).toEqual(["real"]);
    expect(context).toContain("Real content");
  });

  it("returns empty context for empty slug list", async () => {
    const { context, slugs } = await buildContext([]);
    expect(context).toBe("");
    expect(slugs).toEqual([]);
  });

  it("returns empty context when all slugs reference deleted pages", async () => {
    await ensureDirectories();
    // No pages written — all references are to nonexistent pages
    const { context, slugs } = await buildContext(["ghost1", "ghost2"]);
    expect(context).toBe("");
    expect(slugs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// searchIndex — respects pre-filtered entries from scope
// ---------------------------------------------------------------------------
describe("searchIndex — pre-filtered entries", () => {
  it("returns empty array for empty entries", async () => {
    const result = await searchIndex("neural networks", []);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty query", async () => {
    const entries: IndexEntry[] = [
      { slug: "a", title: "A", summary: "Some content" },
    ];
    const result = await searchIndex("", entries);
    expect(result).toEqual([]);
  });

  it("ranks entries by BM25 relevance", async () => {
    const entries: IndexEntry[] = [
      { slug: "irrelevant", title: "Cooking", summary: "How to make pasta" },
      { slug: "relevant", title: "Neural Networks", summary: "Deep neural networks for learning" },
      { slug: "somewhat", title: "Machine Learning", summary: "Learning algorithms and neural methods" },
    ];
    const result = await searchIndex("neural networks", entries, false);
    expect(result.length).toBeGreaterThan(0);
    // "relevant" should rank first — it has both "neural" and "networks" in title+summary
    expect(result[0]).toBe("relevant");
  });
});
