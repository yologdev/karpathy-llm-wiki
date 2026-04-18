import { describe, it, expect } from "vitest";
import { tokenize, buildCorpusStats, bm25Score } from "../bm25";
import { BM25_K1, BM25_B } from "../constants";
import type { IndexEntry } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for building an IndexEntry with sensible defaults. */
function entry(slug: string, title: string, summary: string): IndexEntry {
  return { slug, title, summary };
}

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe("tokenize", () => {
  it("splits on non-alphanumeric characters and lowercases", () => {
    const tokens = tokenize("Hello World Foo");
    expect(tokens).toEqual(["hello", "world", "foo"]);
  });

  it("filters common stop words", () => {
    const tokens = tokenize("the quick brown fox is what");
    // "the", "is", "what" are stop words
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("what");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
  });

  it("removes tokens shorter than 2 characters", () => {
    const tokens = tokenize("I a go to x y z run");
    // "i", "a" are stop words; "x", "y", "z" are < 2 chars
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("x");
    expect(tokens).not.toContain("y");
    expect(tokens).not.toContain("z");
    // "go" is 2 chars but "to" is a stop word; "run" is 3 chars
    expect(tokens).toContain("go");
    expect(tokens).toContain("run");
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles punctuation-heavy input", () => {
    const tokens = tokenize("hello!!! world... foo-bar? baz_qux");
    expect(tokens).toEqual(["hello", "world", "foo", "bar", "baz", "qux"]);
  });

  it("preserves numbers as tokens", () => {
    const tokens = tokenize("chapter 42 section 100");
    expect(tokens).toContain("chapter");
    expect(tokens).toContain("42");
    expect(tokens).toContain("section");
    expect(tokens).toContain("100");
  });
});

// ---------------------------------------------------------------------------
// buildCorpusStats
// ---------------------------------------------------------------------------

describe("buildCorpusStats", () => {
  it("returns N=0 and avgdl=0 for empty entries list", async () => {
    const stats = await buildCorpusStats([], { fullBody: false });
    expect(stats.N).toBe(0);
    expect(stats.avgdl).toBe(0);
    expect(stats.df.size).toBe(0);
    expect(stats.docTokens.size).toBe(0);
  });

  it("computes correct stats for a single entry", async () => {
    const entries = [entry("neural-nets", "Neural Networks", "Deep learning fundamentals")];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    expect(stats.N).toBe(1);
    // Tokenizes "Neural Networks Deep learning fundamentals"
    const expectedTokens = tokenize("Neural Networks Deep learning fundamentals");
    expect(stats.docTokens.get("neural-nets")).toEqual(expectedTokens);
    expect(stats.avgdl).toBe(expectedTokens.length);

    // Each unique token should have df = 1
    for (const tok of new Set(expectedTokens)) {
      expect(stats.df.get(tok)).toBe(1);
    }
  });

  it("computes correct document frequencies across multiple entries", async () => {
    const entries = [
      entry("page-a", "Machine Learning", "Supervised learning algorithms"),
      entry("page-b", "Deep Learning", "Neural network architectures for learning"),
      entry("page-c", "Reinforcement Learning", "Reward based learning agents"),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    expect(stats.N).toBe(3);

    // "learning" appears in all 3 documents
    expect(stats.df.get("learning")).toBe(3);

    // "machine" appears only in page-a
    expect(stats.df.get("machine")).toBe(1);

    // "neural" appears only in page-b
    expect(stats.df.get("neural")).toBe(1);
  });

  it("calculates average document length correctly", async () => {
    const entries = [
      entry("short", "Cat", "Meow"),
      entry("long", "Longer Title Here", "Extra words padding summary content stuff"),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    const tokensShort = stats.docTokens.get("short")!;
    const tokensLong = stats.docTokens.get("long")!;
    const expectedAvg = (tokensShort.length + tokensLong.length) / 2;

    expect(stats.avgdl).toBe(expectedAvg);
  });

  it("counts df per document, not per occurrence", async () => {
    // "quantum" appears 5 times in title+summary but should only count df=1
    const entries = [
      entry(
        "quantum",
        "Quantum Quantum",
        "quantum quantum quantum computing",
      ),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    expect(stats.df.get("quantum")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// bm25Score
// ---------------------------------------------------------------------------

describe("bm25Score", () => {
  it("returns 0 for empty query tokens", async () => {
    const entries = [entry("test", "Test Page", "Some content here")];
    const stats = await buildCorpusStats(entries, { fullBody: false });
    expect(bm25Score(entries[0], [], stats)).toBe(0);
  });

  it("returns 0 for empty corpus (N=0)", () => {
    const emptyStats = {
      N: 0,
      avgdl: 0,
      df: new Map<string, number>(),
      docTokens: new Map<string, string[]>(),
    };
    const e = entry("test", "Test", "Content");
    expect(bm25Score(e, ["test"], emptyStats)).toBe(0);
  });

  it("returns 0 when document has no matching tokens", async () => {
    const entries = [entry("cats", "Cats", "Feline animals and kittens")];
    const stats = await buildCorpusStats(entries, { fullBody: false });
    const score = bm25Score(entries[0], ["quantum", "physics"], stats);
    expect(score).toBe(0);
  });

  it("returns positive score for a single matching term", async () => {
    const entries = [entry("ml", "Machine Learning", "Algorithms and models")];
    const stats = await buildCorpusStats(entries, { fullBody: false });
    const score = bm25Score(entries[0], ["machine"], stats);
    expect(score).toBeGreaterThan(0);
  });

  it("scores higher with multiple matching terms than single", async () => {
    const entries = [
      entry("ml", "Machine Learning", "Algorithms and models for machine learning tasks"),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    const singleScore = bm25Score(entries[0], ["machine"], stats);
    const multiScore = bm25Score(entries[0], ["machine", "algorithms"], stats);

    expect(multiScore).toBeGreaterThan(singleScore);
  });

  it("gives higher IDF to terms appearing in fewer documents", async () => {
    // "common" appears in all 3 docs; "rare" appears in only 1
    const entries = [
      entry("doc1", "Common Rare", "Common word appears here"),
      entry("doc2", "Common Topic", "Common word again"),
      entry("doc3", "Common Other", "Common word third"),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    // Score doc1 for "rare" vs "common" — "rare" should have higher IDF
    const scoreRare = bm25Score(entries[0], ["rare"], stats);
    const scoreCommon = bm25Score(entries[0], ["common"], stats);

    expect(scoreRare).toBeGreaterThan(scoreCommon);
  });

  it("penalizes longer documents via length normalization (b parameter)", async () => {
    // Both docs contain "target" once, but doc2 is much longer
    const entries = [
      entry("short-doc", "Target", "Brief"),
      entry("long-doc", "Target", "Extra padding words filler content material additional stuff verbose lengthy"),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });

    // Confirm BM25_B > 0 so length normalization is active
    expect(BM25_B).toBeGreaterThan(0);

    const scoreShort = bm25Score(entries[0], ["target"], stats);
    const scoreLong = bm25Score(entries[1], ["target"], stats);

    // Shorter doc should score higher (or equal) because "target" is a larger
    // fraction of its content
    expect(scoreShort).toBeGreaterThan(scoreLong);
  });

  it("ranks the best-matching document highest in a small corpus", async () => {
    const entries = [
      entry("transformers", "Transformer Architecture", "Self attention mechanism for sequence modeling"),
      entry("cnn", "Convolutional Networks", "Image recognition with convolution filters"),
      entry("attention", "Attention Mechanisms", "Transformer attention heads multi head attention queries keys values"),
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });
    const queryTokens = tokenize("How does transformer attention work?");

    const scores = entries.map((e) => ({
      slug: e.slug,
      score: bm25Score(e, queryTokens, stats),
    }));
    scores.sort((a, b) => b.score - a.score);

    // "attention" page mentions both "transformer" and "attention" multiple times
    expect(scores[0].slug).toBe("attention");
  });

  it("uses BM25_K1 and BM25_B constants for scoring", () => {
    // Verify the constants are the expected standard values
    expect(BM25_K1).toBe(1.5);
    expect(BM25_B).toBe(0.75);
  });
});
