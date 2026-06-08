import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IndexEntry } from "../types";

// Mock only the data SOURCES — BM25, RRF and the constants stay real, so these
// tests exercise the actual hybrid ranking + pagination logic in searchCommons.
vi.mock("../commons", () => ({
  listCommonsPages: vi.fn(async () => [] as IndexEntry[]),
}));
vi.mock("../wiki", () => ({
  listReadableWikiPages: vi.fn(async () => [] as IndexEntry[]),
  // Agent pages are `type: agent-*` — mirror the real predicate.
  isAgentScopedType: (t?: string) => !!t && t.startsWith("agent-"),
}));
vi.mock("../vault", () => ({
  getVault: vi.fn(async () => null),
}));
vi.mock("../talk", () => ({
  getDiscussionStatsForSlugs: vi.fn(async () => new Map()),
}));
vi.mock("../embeddings", () => ({
  searchByVector: vi.fn(async () => [] as Array<{ slug: string; score: number }>),
}));

import { searchCommons } from "../browse";
import { listCommonsPages } from "../commons";
import { listReadableWikiPages } from "../wiki";
import { getVault } from "../vault";
import { searchByVector } from "../embeddings";

const mockedCommons = vi.mocked(listCommonsPages);
const mockedReadable = vi.mocked(listReadableWikiPages);
const mockedGetVault = vi.mocked(getVault);
const mockedVector = vi.mocked(searchByVector);

function entry(slug: string, over: Partial<IndexEntry> = {}): IndexEntry {
  return {
    slug,
    title: slug,
    summary: "",
    owner: "alice",
    ...over,
  } as IndexEntry;
}

const POOL: IndexEntry[] = [
  entry("backpropagation", {
    title: "Backpropagation",
    summary: "Training neural networks by gradient descent.",
    tags: ["ml", "training"],
    confidence: 0.9,
    sourceCount: 3,
    updated: "2026-06-01",
  }),
  entry("transformers", {
    title: "Transformers",
    summary: "Attention-based sequence models.",
    tags: ["ml", "nlp"],
    confidence: 0.7,
    sourceCount: 5,
    updated: "2026-06-05",
  }),
  entry("vector-databases", {
    title: "Vector Databases",
    summary: "Storage for embeddings and similarity search.",
    tags: ["infra"],
    confidence: 0.6,
    sourceCount: 1,
    updated: "2026-06-03",
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedCommons.mockResolvedValue(POOL);
  mockedReadable.mockResolvedValue([]);
  mockedGetVault.mockResolvedValue(null);
  mockedVector.mockResolvedValue([]);
});

describe("searchCommons — list mode (no query)", () => {
  it("returns the whole commons sorted by recent, with a stable total", async () => {
    const r = await searchCommons(null, { sort: "recent" });
    expect(r.total).toBe(3);
    expect(r.results.map((p) => p.slug)).toEqual([
      "transformers", // 2026-06-05
      "vector-databases", // 2026-06-03
      "backpropagation", // 2026-06-01
    ]);
  });

  it("sorts by confidence and by sources", async () => {
    const byConf = await searchCommons(null, { sort: "confidence" });
    expect(byConf.results[0].slug).toBe("backpropagation"); // 0.9
    const bySrc = await searchCommons(null, { sort: "sources" });
    expect(bySrc.results[0].slug).toBe("transformers"); // 5
  });

  it("exposes tag facets across the full pool, by count desc", async () => {
    const r = await searchCommons(null, {});
    expect(r.tags).toEqual([
      ["ml", 2],
      ["training", 1],
      ["nlp", 1],
      ["infra", 1],
    ]);
  });

  it("filters by tag but keeps the facet counts from the unfiltered pool", async () => {
    const r = await searchCommons(null, { tag: "infra" });
    expect(r.results.map((p) => p.slug)).toEqual(["vector-databases"]);
    expect(r.total).toBe(1);
    // Facets still reflect the whole pool so the rail doesn't collapse.
    expect(r.tags.find(([t]) => t === "ml")).toEqual(["ml", 2]);
  });
});

describe("searchCommons — query mode (hybrid)", () => {
  it("ranks BM25 keyword matches and drops non-matches", async () => {
    const r = await searchCommons("attention sequence", {});
    expect(r.results[0].slug).toBe("transformers");
    expect(r.results.map((p) => p.slug)).not.toContain("backpropagation");
  });

  it("surfaces a semantic-only match via vector fusion (no keyword overlap)", async () => {
    // "embeddings" doesn't keyword-match the query, but the vector store says
    // vector-databases is semantically closest — hybrid must surface it.
    mockedVector.mockResolvedValue([{ slug: "vector-databases", score: 0.95 }]);
    const r = await searchCommons("similarity storage", {});
    expect(r.results.map((p) => p.slug)).toContain("vector-databases");
  });

  it("falls back to BM25 ranking when vector search throws", async () => {
    mockedVector.mockRejectedValue(new Error("no embedding provider"));
    const r = await searchCommons("neural networks", {});
    expect(r.results[0].slug).toBe("backpropagation");
  });

  it("ignores the sort facet when a query is present (relevance order wins)", async () => {
    // "sources" sort would put transformers first; the query targets backprop.
    const r = await searchCommons("gradient descent", { sort: "sources" });
    expect(r.results[0].slug).toBe("backpropagation");
  });
});

describe("searchCommons — pagination", () => {
  it("slices to the requested page and reports the full total", async () => {
    const p1 = await searchCommons(null, { sort: "recent", page: 1, pageSize: 2 });
    expect(p1.total).toBe(3);
    expect(p1.results.map((p) => p.slug)).toEqual(["transformers", "vector-databases"]);
    const p2 = await searchCommons(null, { sort: "recent", page: 2, pageSize: 2 });
    expect(p2.results.map((p) => p.slug)).toEqual(["backpropagation"]);
  });

  it("returns an empty slice but the true total for a page beyond the end", async () => {
    const r = await searchCommons(null, { page: 99, pageSize: 2 });
    expect(r.results).toEqual([]);
    expect(r.total).toBe(3);
  });

  it("handles an empty pool without throwing", async () => {
    mockedCommons.mockResolvedValue([]);
    const r = await searchCommons("anything", {});
    expect(r).toMatchObject({ results: [], total: 0, tags: [] });
  });
});

describe("searchCommons — vault scope", () => {
  it("returns nothing for a private (non-resolving) vault", async () => {
    mockedGetVault.mockResolvedValue({
      id: "v1",
      visibility: "private",
      slugs: ["transformers"],
    } as never);
    const r = await searchCommons(null, { scope: "vault:v1" });
    expect(r.total).toBe(0);
    expect(r.results).toEqual([]);
  });

  it("intersects a public vault's refs with readable pages and excludes agent pages", async () => {
    mockedGetVault.mockResolvedValue({
      id: "v1",
      visibility: "public",
      slugs: ["transformers", "agent-note"],
    } as never);
    mockedReadable.mockResolvedValue([
      entry("transformers", { title: "Transformers", updated: "2026-06-05" }),
      entry("agent-note", { type: "agent-knowledge", updated: "2026-06-06" }),
      entry("unreferenced", { updated: "2026-06-07" }),
    ]);
    const r = await searchCommons(null, { scope: "vault:v1" });
    // Only the referenced, non-agent page survives.
    expect(r.results.map((p) => p.slug)).toEqual(["transformers"]);
  });
});
