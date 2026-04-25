import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { searchIndex, buildContext, query, saveAnswerToWiki, buildCorpusStats, bm25Score, extractCitedSlugs, reciprocalRankFusion, buildQuerySystemPrompt, TABLE_FORMAT_INSTRUCTION, extractBestSnippet } from "../query";
import { writeWikiPage, updateIndex, ensureDirectories, readWikiPage, readWikiPageWithFrontmatter, listWikiPages } from "../wiki";
import type { IndexEntry } from "../types";

// ---------------------------------------------------------------------------
// Mock callLLM and hasLLMKey so tests don't require real API keys
// ---------------------------------------------------------------------------
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(async () => "mocked response"),
}));

// Mock searchByVector from embeddings so tests don't need a real provider
vi.mock("../embeddings", () => ({
  searchByVector: vi.fn(async () => []),
  upsertEmbedding: vi.fn(async () => {}),
  removeEmbedding: vi.fn(async () => {}),
}));

import { hasLLMKey, callLLM } from "../llm";
import { searchByVector } from "../embeddings";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);
const mockedSearchByVector = vi.mocked(searchByVector);

// ---------------------------------------------------------------------------
// Temp directory setup (same pattern as other test files)
// ---------------------------------------------------------------------------
let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "query-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");

  // Reset mocks
  mockedHasLLMKey.mockReturnValue(false);
  mockedCallLLM.mockReset();
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
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// BM25 scoring tests
// ---------------------------------------------------------------------------
describe("BM25 scoring", () => {
  it("buildCorpusStats handles an empty corpus safely", async () => {
    const stats = await buildCorpusStats([], { fullBody: false });
    expect(stats.N).toBe(0);
    expect(stats.avgdl).toBe(0);
    expect(stats.df.size).toBe(0);
    expect(stats.docTokens.size).toBe(0);
  });

  it("bm25Score returns 0 for empty query tokens (no NaN)", async () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Some content here" },
      { slug: "beta", title: "Beta", summary: "Other content here" },
    ];
    const stats = await buildCorpusStats(entries, { fullBody: false });
    const score = bm25Score(entries[0], [], stats);
    expect(score).toBe(0);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("bm25Score returns 0 against an empty corpus without throwing", async () => {
    const entry: IndexEntry = { slug: "x", title: "X", summary: "X" };
    const stats = await buildCorpusStats([], { fullBody: false });
    const score = bm25Score(entry, ["anything"], stats);
    expect(score).toBe(0);
  });

  it("ranks rarer terms higher via IDF (beats substring counting)", async () => {
    // "learning" appears in every doc, "backpropagation" appears in exactly one.
    // Old substring scorer would give both docs with both terms a score of 2.
    // BM25 should strongly favor the doc that actually contains the rare term.
    const entries: IndexEntry[] = [
      {
        slug: "backprop",
        title: "Backpropagation",
        summary: "Backpropagation algorithm for learning",
      },
      {
        slug: "general-learning",
        title: "General Learning",
        summary: "Overview of learning concepts",
      },
      {
        slug: "supervised",
        title: "Supervised Learning",
        summary: "Supervised learning approaches",
      },
      {
        slug: "unsupervised",
        title: "Unsupervised Learning",
        summary: "Unsupervised learning approaches",
      },
    ];

    const stats = await buildCorpusStats(entries, { fullBody: false });
    const q = tokenizeForTest("backpropagation learning");

    const scores = entries.map((e) => ({
      slug: e.slug,
      score: bm25Score(e, q, stats),
    }));
    scores.sort((a, b) => b.score - a.score);

    expect(scores[0].slug).toBe("backprop");
    // The doc with the rare term must strictly outrank all purely-"learning" docs
    expect(scores[0].score).toBeGreaterThan(scores[1].score);
  });

  it("produces deterministic ranking on a handcrafted corpus", async () => {
    const entries: IndexEntry[] = [
      {
        slug: "pasta-recipes",
        title: "Pasta Recipes",
        summary: "Italian pasta cooking guide",
      },
      {
        slug: "neural-nets",
        title: "Neural Networks",
        summary: "Deep neural network architectures",
      },
      {
        slug: "transformer",
        title: "Transformer Architecture",
        summary: "Self attention transformer neural model",
      },
      {
        slug: "gardening",
        title: "Gardening Tips",
        summary: "Growing tomatoes in the backyard",
      },
      {
        slug: "python-intro",
        title: "Python Introduction",
        summary: "Python programming language basics",
      },
    ];

    const stats = await buildCorpusStats(entries, { fullBody: false });
    const q = tokenizeForTest("transformer neural architecture");

    const scores = entries
      .map((e) => ({ slug: e.slug, score: bm25Score(e, q, stats) }))
      .sort((a, b) => b.score - a.score);

    // "transformer" contains all three query terms — must rank first
    expect(scores[0].slug).toBe("transformer");
    // "neural-nets" contains two of them — must rank second
    expect(scores[1].slug).toBe("neural-nets");
    // Unrelated docs must score 0
    const pasta = scores.find((s) => s.slug === "pasta-recipes");
    const garden = scores.find((s) => s.slug === "gardening");
    const python = scores.find((s) => s.slug === "python-intro");
    expect(pasta!.score).toBe(0);
    expect(garden!.score).toBe(0);
    expect(python!.score).toBe(0);
  });

  it("penalizes longer documents via length normalization", async () => {
    // Both docs contain "widget" exactly once. The shorter one should score
    // higher because BM25's length normalization penalizes the longer doc.
    const entries: IndexEntry[] = [
      {
        slug: "short",
        title: "Widget",
        summary: "Small",
      },
      {
        slug: "long",
        title: "Widget",
        summary:
          "Small something else random filler words padding extra tokens making this document substantially longer overall",
      },
    ];

    const stats = await buildCorpusStats(entries, { fullBody: false });
    const q = tokenizeForTest("widget");

    const shortScore = bm25Score(entries[0], q, stats);
    const longScore = bm25Score(entries[1], q, stats);

    expect(shortScore).toBeGreaterThan(0);
    expect(longScore).toBeGreaterThan(0);
    expect(shortScore).toBeGreaterThan(longScore);
  });
});

// ---------------------------------------------------------------------------
// Full-body BM25 indexing tests
// ---------------------------------------------------------------------------
describe("Full-body BM25 indexing", () => {
  it("finds terms that only appear in page bodies, not in title/summary", async () => {
    await ensureDirectories();

    // Write a page whose body contains "quantum entanglement" but whose
    // title/summary do not mention those words at all.
    await writeWikiPage(
      "physics-concepts",
      "# Physics Concepts\n\nBasic physics overview.\n\nQuantum entanglement is a phenomenon where particles become correlated.",
    );

    const entries: IndexEntry[] = [
      { slug: "physics-concepts", title: "Physics Concepts", summary: "Basic physics overview" },
    ];

    // Title+summary only stats should NOT find "entanglement"
    const titleOnlyStats = await buildCorpusStats(entries, { fullBody: false });
    const titleTokens = titleOnlyStats.docTokens.get("physics-concepts")!;
    expect(titleTokens).not.toContain("entanglement");

    // Full-body stats SHOULD find "entanglement"
    const fullStats = await buildCorpusStats(entries);
    const fullTokens = fullStats.docTokens.get("physics-concepts")!;
    expect(fullTokens).toContain("entanglement");
    expect(fullTokens).toContain("quantum");
  });

  it("searchIndex with fullBody=true finds body-only terms", async () => {
    await ensureDirectories();

    await writeWikiPage(
      "attention-page",
      "# Attention Mechanisms\n\nOverview of attention.\n\nSelf-attention allows tokens to attend to each other in parallel.",
    );
    await writeWikiPage(
      "rnn-page",
      "# Recurrent Networks\n\nOverview of RNNs.\n\nRecurrent neural networks process sequences step by step.",
    );

    const entries: IndexEntry[] = [
      { slug: "attention-page", title: "Attention Mechanisms", summary: "Overview of attention" },
      { slug: "rnn-page", title: "Recurrent Networks", summary: "Overview of RNNs" },
    ];

    // "parallel" only appears in the body of attention-page
    const results = await searchIndex("parallel processing", entries, true);
    expect(results).toContain("attention-page");

    // With fullBody=false, "parallel" shouldn't match anything in title+summary
    const titleOnly = await searchIndex("parallel processing", entries, false);
    expect(titleOnly).not.toContain("attention-page");
  });

  it("gracefully falls back to title+summary when a page can't be read", async () => {
    await ensureDirectories();

    // Don't write any actual page file — readWikiPage will return null
    const entries: IndexEntry[] = [
      { slug: "nonexistent-page", title: "Neural Networks", summary: "Deep learning neural network guide" },
    ];

    // Should not throw, and should still find terms from title+summary
    const stats = await buildCorpusStats(entries);
    expect(stats.N).toBe(1);
    const tokens = stats.docTokens.get("nonexistent-page")!;
    expect(tokens).toContain("neural");
    expect(tokens).toContain("networks");
  });
});

// Local helper mirroring the private tokenize() in query.ts, used only so
// tests can construct query-token inputs to bm25Score without exporting
// tokenize. Keep in sync with query.ts::tokenize.
function tokenizeForTest(text: string): string[] {
  const STOP = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "what", "how", "which", "does", "do", "did", "has", "have", "had",
    "who", "whom", "whose", "where", "when", "why",
    "can", "could", "would", "should", "will", "shall", "may", "might",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
    "into", "through", "during", "before", "after", "above", "below",
    "and", "or", "but", "not", "no", "nor", "so", "if", "then", "than",
    "this", "that", "these", "those", "it", "its",
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "they", "them",
    "tell", "explain", "describe", "give", "show",
  ]);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

// ---------------------------------------------------------------------------
// searchIndex tests
// ---------------------------------------------------------------------------
describe("searchIndex", () => {
  it("returns matching slugs when question keywords match index entries", async () => {
    const entries: IndexEntry[] = [
      { slug: "machine-learning", title: "Machine Learning", summary: "Overview of ML algorithms" },
      { slug: "cooking", title: "Cooking Tips", summary: "How to cook pasta" },
      { slug: "neural-networks", title: "Neural Networks", summary: "Deep learning neural network architectures" },
    ];

    const result = await searchIndex("What are neural network architectures?", entries);

    expect(result).toContain("neural-networks");
    // "machine-learning" may or may not match depending on token overlap
    expect(result).not.toContain("cooking");
  });

  it("returns empty array when nothing matches", async () => {
    const entries: IndexEntry[] = [
      { slug: "cooking", title: "Cooking Tips", summary: "How to cook pasta" },
      { slug: "gardening", title: "Gardening", summary: "Growing vegetables in your backyard" },
    ];

    const result = await searchIndex("quantum physics equations", entries);

    expect(result).toEqual([]);
  });

  it("returns empty array for empty or whitespace-only queries", async () => {
    const entries: IndexEntry[] = [
      { slug: "ml", title: "Machine Learning", summary: "Overview of ML" },
      { slug: "cooking", title: "Cooking Tips", summary: "How to cook pasta" },
    ];

    expect(await searchIndex("", entries)).toEqual([]);
    expect(await searchIndex("   ", entries)).toEqual([]);
    expect(await searchIndex("\t\n", entries)).toEqual([]);
  });

  it("handles empty index", async () => {
    const result = await searchIndex("anything at all", []);
    expect(result).toEqual([]);
  });

  it("with no LLM key, falls back to keyword matching", async () => {
    mockedHasLLMKey.mockReturnValue(false);

    const entries: IndexEntry[] = [
      { slug: "python", title: "Python", summary: "Python programming language" },
      { slug: "rust", title: "Rust", summary: "Rust systems programming language" },
    ];

    const result = await searchIndex("Tell me about Python programming", entries);

    expect(result).toContain("python");
    // callLLM should not have been called
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("uses LLM re-ranking when available and parses JSON response", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue('["deep-learning", "neural-networks"]');

    const entries: IndexEntry[] = [
      { slug: "neural-networks", title: "Neural Networks", summary: "NN overview neural networks" },
      { slug: "deep-learning", title: "Deep Learning", summary: "Deep learning neural networks" },
      { slug: "cooking", title: "Cooking", summary: "Food preparation" },
    ];
    // Write pages so BM25 full-body can index them and they appear as fusion candidates
    await writeWikiPage("neural-networks", "# Neural Networks\n\nNeural networks overview.");
    await writeWikiPage("deep-learning", "# Deep Learning\n\nDeep learning with neural networks.");
    await writeWikiPage("cooking", "# Cooking\n\nFood preparation.");
    await updateIndex(entries);

    const result = await searchIndex("neural networks", entries);

    // LLM re-ranked the fusion candidates
    expect(result).toEqual(["deep-learning", "neural-networks"]);
    expect(mockedCallLLM).toHaveBeenCalledOnce();

    // The re-ranking prompt should contain content snippets and relevance criteria
    const prompt = mockedCallLLM.mock.calls[0][0];
    expect(prompt).toContain("snippet:");
    expect(prompt).toContain("Candidate pages:");
    expect(prompt).toContain("Direct topic match");
    expect(prompt).toContain("Citation potential");
  });

  it("falls back to fusion order when LLM returns invalid JSON", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("I think you should look at neural networks");

    const entries: IndexEntry[] = [
      { slug: "neural-networks", title: "Neural Networks", summary: "NN architectures overview" },
      { slug: "cooking", title: "Cooking", summary: "Food preparation tips" },
    ];
    await writeWikiPage("neural-networks", "# Neural Networks\n\nNN architectures overview.");
    await writeWikiPage("cooking", "# Cooking\n\nFood preparation tips.");
    await updateIndex(entries);

    const result = await searchIndex("neural network architectures", entries);

    // Should fall back to fusion/BM25 ranking
    expect(result).toContain("neural-networks");
  });

  it("falls back to fusion order when LLM re-ranking throws", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockRejectedValue(new Error("API error"));

    const entries: IndexEntry[] = [
      { slug: "python", title: "Python", summary: "Python programming language" },
    ];
    await writeWikiPage("python", "# Python\n\nPython programming language.");
    await updateIndex(entries);

    const result = await searchIndex("Python programming", entries);

    expect(result).toContain("python");
  });

  it("filters out slugs not in fusion candidates from LLM response", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    // LLM returns a slug that exists in entries but wasn't a fusion candidate
    mockedCallLLM.mockResolvedValue('["valid-slug", "not-a-candidate"]');

    const entries: IndexEntry[] = [
      { slug: "valid-slug", title: "Valid", summary: "A valid test page" },
      { slug: "not-a-candidate", title: "Not a candidate", summary: "Unrelated topic" },
    ];
    await writeWikiPage("valid-slug", "# Valid\n\nA valid test page about testing.");
    await writeWikiPage("not-a-candidate", "# Not a candidate\n\nUnrelated topic.");
    await updateIndex(entries);

    // Search for "test" — only "valid-slug" will be a BM25 match
    const result = await searchIndex("test page", entries);

    // "not-a-candidate" should be filtered out since it wasn't a fusion candidate
    expect(result).toContain("valid-slug");
    expect(result).not.toContain("not-a-candidate");
  });

  it("sorts keyword results by score descending", async () => {
    const entries: IndexEntry[] = [
      { slug: "partial", title: "Partial", summary: "About machine systems" },
      { slug: "best-match", title: "Machine Learning", summary: "Machine learning algorithms and systems" },
    ];

    const result = await searchIndex("machine learning systems", entries);

    // "best-match" should rank higher (more keyword hits)
    expect(result[0]).toBe("best-match");
  });

  it("LLM re-ranking narrows candidates from fusion results, not full index", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    const entries: IndexEntry[] = [
      { slug: "relevant-a", title: "Relevant A", summary: "Machine learning overview" },
      { slug: "relevant-b", title: "Relevant B", summary: "Machine learning algorithms" },
      { slug: "irrelevant", title: "Irrelevant", summary: "Cooking recipes for dinner" },
    ];
    await writeWikiPage("relevant-a", "# Relevant A\n\nMachine learning overview with details.");
    await writeWikiPage("relevant-b", "# Relevant B\n\nMachine learning algorithms in depth.");
    await writeWikiPage("irrelevant", "# Irrelevant\n\nCooking recipes for dinner.");
    await updateIndex(entries);

    // LLM re-ranking returns both relevant pages
    mockedCallLLM.mockResolvedValue('["relevant-b", "relevant-a"]');

    const result = await searchIndex("machine learning", entries);

    // LLM was called for re-ranking
    expect(mockedCallLLM).toHaveBeenCalledOnce();

    // The prompt sent to the LLM should NOT contain the irrelevant page
    // since it wasn't a BM25/fusion candidate for "machine learning"
    const prompt = mockedCallLLM.mock.calls[0][0];
    expect(prompt).toContain("relevant-a");
    expect(prompt).toContain("relevant-b");
    expect(prompt).not.toContain("Cooking recipes");

    // Result should only contain fusion candidates that LLM kept
    expect(result).toEqual(["relevant-b", "relevant-a"]);
  });

  it("LLM re-ranking failure falls back to fusion order", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockRejectedValue(new Error("LLM service unavailable"));

    const entries: IndexEntry[] = [
      { slug: "page-a", title: "Page A", summary: "Deep learning neural networks" },
      { slug: "page-b", title: "Page B", summary: "Neural networks architectures" },
    ];
    await writeWikiPage("page-a", "# Page A\n\nDeep learning neural networks content.");
    await writeWikiPage("page-b", "# Page B\n\nNeural networks architectures content.");
    await updateIndex(entries);

    const result = await searchIndex("neural networks", entries);

    // Despite LLM failure, we still get results from fusion/BM25
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("page-a");
    expect(result).toContain("page-b");
  });

  it("re-ranking prompt includes content snippets from page bodies", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue('["snippet-page"]');

    const entries: IndexEntry[] = [
      { slug: "snippet-page", title: "Snippet Page", summary: "A page about transformer" },
    ];
    const pageBody = "# Snippet Page\n\nTransformer architectures revolutionized natural language processing. " +
      "Self-attention mechanisms allow models to weigh the importance of different parts of the input.";
    await writeWikiPage("snippet-page", pageBody);
    await updateIndex(entries);

    // Use "transformer" (exact match for BM25 tokenization)
    const result = await searchIndex("transformer architectures", entries);

    expect(mockedCallLLM).toHaveBeenCalledOnce();
    const prompt = mockedCallLLM.mock.calls[0][0];

    // The prompt should include actual page content, not just index-level summary
    expect(prompt).toContain("Transformer architectures revolutionized");
    expect(prompt).toContain("snippet:");
    expect(prompt).toContain("slug: snippet-page");
    expect(result).toEqual(["snippet-page"]);
  });

  it("re-ranking prompt includes relevance criteria and chain-of-thought instructions", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(
      'The page directly addresses transformers.\n["criteria-page"]'
    );

    const entries: IndexEntry[] = [
      { slug: "criteria-page", title: "Criteria Page", summary: "Transformers overview" },
    ];
    await writeWikiPage("criteria-page", "# Criteria Page\n\nTransformers overview content.");
    await updateIndex(entries);

    await searchIndex("transformers", entries);

    expect(mockedCallLLM).toHaveBeenCalledOnce();
    const prompt = mockedCallLLM.mock.calls[0][0];

    // Verify all three relevance criteria are present
    expect(prompt).toContain("Direct topic match");
    expect(prompt).toContain("Conceptual relevance");
    expect(prompt).toContain("Citation potential");

    // Verify chain-of-thought instruction
    expect(prompt).toContain("Think briefly");
  });
});

// ---------------------------------------------------------------------------
// extractBestSnippet tests
// ---------------------------------------------------------------------------
describe("extractBestSnippet", () => {
  it("returns full content when shorter than maxChars", () => {
    const content = "Short page about machine learning.";
    const result = extractBestSnippet(content, ["machine", "learning"], 800);
    expect(result).toBe(content);
  });

  it("falls back to first N chars when queryTokens is empty", () => {
    const content = "A".repeat(200) + "B".repeat(200);
    const result = extractBestSnippet(content, [], 200);
    expect(result).toBe("A".repeat(200));
  });

  it("selects the most relevant window from a long document", () => {
    // Build a document where the query-relevant content is in the middle
    const intro = "This is a general introduction about cooking and recipes. ".repeat(20);
    const relevant = "Transformers and attention mechanisms are key to modern neural network architectures. ".repeat(10);
    const outro = "This section discusses gardening and plant care techniques. ".repeat(20);
    const content = intro + relevant + outro;

    const result = extractBestSnippet(content, ["transformers", "attention", "neural", "architectures"], 400);

    // The snippet should contain the relevant section, not the intro or outro
    expect(result).toContain("Transformers");
    expect(result).toContain("attention");
    expect(result).not.toContain("gardening");
  });

  it("returns first N chars when no tokens match anywhere", () => {
    const content = "Alpha beta gamma delta epsilon. ".repeat(50);
    const result = extractBestSnippet(content, ["zzz", "yyy"], 100);
    // Falls back to first 100 chars (all windows score 0, bestStart stays 0)
    expect(result).toBe(content.slice(0, 100));
  });

  it("respects maxChars limit", () => {
    const content = "word ".repeat(500);
    const result = extractBestSnippet(content, ["word"], 200);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// buildContext tests
// ---------------------------------------------------------------------------
describe("buildContext", () => {
  it("returns empty context when no slugs provided", async () => {
    const result = await buildContext();
    expect(result.context).toBe("");
    expect(result.slugs).toEqual([]);
  });

  it("returns empty context when empty slug array provided", async () => {
    const result = await buildContext([]);
    expect(result.context).toBe("");
    expect(result.slugs).toEqual([]);
  });

  it("loads only specified pages", async () => {
    await writeWikiPage("alpha", "# Alpha\n\nAlpha content here.");
    await writeWikiPage("beta", "# Beta\n\nBeta content here.");
    await writeWikiPage("gamma", "# Gamma\n\nGamma content here.");

    const result = await buildContext(["alpha", "gamma"]);

    expect(result.slugs).toEqual(["alpha", "gamma"]);
    expect(result.context).toContain("Alpha content");
    expect(result.context).toContain("Gamma content");
    expect(result.context).not.toContain("Beta content");
  });

  it("skips pages that don't exist on disk", async () => {
    await writeWikiPage("exists", "# Exists\n\nReal content.");

    const result = await buildContext(["exists", "ghost"]);

    expect(result.slugs).toEqual(["exists"]);
    expect(result.context).toContain("Real content");
  });
});

// ---------------------------------------------------------------------------
// query() integration tests
// ---------------------------------------------------------------------------
describe("query", () => {
  it("returns empty-wiki message when no pages exist", async () => {
    await ensureDirectories();

    const result = await query("What is anything?");

    expect(result.answer).toContain("wiki is empty");
    expect(result.answer).toContain("ingest");
    expect(result.sources).toEqual([]);
  });

  it("returns no-api-key message when no key configured", async () => {
    mockedHasLLMKey.mockReturnValue(false);

    // Create a small wiki (<=5 pages)
    await writeWikiPage("page-one", "# Page One\n\nSome content.");
    await updateIndex([
      { slug: "page-one", title: "Page One", summary: "First page" },
    ]);

    const result = await query("What is page one?");

    expect(result.answer).toContain("No API key configured");
    expect(result.answer).toContain("page-one");
    expect(result.sources).toEqual([]);
  });

  it("loads all pages for small wikis (<= 5 pages)", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("Answer citing [Alpha](alpha.md)");

    await writeWikiPage("alpha", "# Alpha\n\nAlpha content.");
    await writeWikiPage("beta", "# Beta\n\nBeta content.");
    await updateIndex([
      { slug: "alpha", title: "Alpha", summary: "Alpha page" },
      { slug: "beta", title: "Beta", summary: "Beta page" },
    ]);

    const result = await query("Tell me about alpha");

    expect(result.answer).toContain("Alpha");
    expect(result.sources).toContain("alpha");

    // The system prompt sent to callLLM should contain both pages
    const systemPrompt = mockedCallLLM.mock.calls[0][0];
    expect(systemPrompt).toContain("Alpha content");
    expect(systemPrompt).toContain("Beta content");
  });

  it("uses searchIndex for large wikis (> 5 pages)", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    // First call is re-ranking in searchIndex, second is the actual query
    mockedCallLLM
      .mockResolvedValueOnce('["target-page"]')
      .mockResolvedValueOnce("Here is the answer about [Target](target-page.md)");

    const entries: IndexEntry[] = [];
    for (let i = 1; i <= 7; i++) {
      const slug = i === 4 ? "target-page" : `page-${i}`;
      const title = i === 4 ? "Target Page" : `Page ${i}`;
      const summary = i === 4 ? "The target topic we want" : `Content for page ${i}`;
      await writeWikiPage(slug, `# ${title}\n\n${summary} with details.`);
      entries.push({ slug, title, summary });
    }
    await updateIndex(entries);

    const result = await query("Tell me about the target topic");

    // Should have called LLM twice: once for re-ranking, once for answer
    expect(mockedCallLLM).toHaveBeenCalledTimes(2);
    expect(result.sources).toContain("target-page");

    // The query prompt should only load target-page's full content, not all pages
    const queryPrompt = mockedCallLLM.mock.calls[1][0];
    expect(queryPrompt).toContain("The target topic we want with details.");
    // page-1's full page content should NOT be loaded (only its index listing)
    expect(queryPrompt).not.toContain("=== Page: Page 1");
  });

  it("includes full index listing in system prompt for large wikis", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    mockedCallLLM
      .mockResolvedValueOnce('["page-1"]')
      .mockResolvedValueOnce("The answer");

    const entries: IndexEntry[] = [];
    for (let i = 1; i <= 6; i++) {
      const slug = `page-${i}`;
      const title = `Page ${i}`;
      await writeWikiPage(slug, `# ${title}\n\nContent for page ${i}.`);
      entries.push({ slug, title, summary: `Summary ${i}` });
    }
    await updateIndex(entries);

    await query("question about page 1");

    // The system prompt for the final query should mention other pages
    const systemPrompt = mockedCallLLM.mock.calls[1][0];
    expect(systemPrompt).toContain("other pages");
  });
});

// ---------------------------------------------------------------------------
// saveAnswerToWiki tests
// ---------------------------------------------------------------------------
describe("saveAnswerToWiki", () => {
  it("saves an answer as a wiki page and updates the index", async () => {
    await ensureDirectories();

    const result = await saveAnswerToWiki(
      "Neural Networks Explained",
      "Neural networks are computational models. They consist of layers of neurons.",
    );

    expect(result.slug).toBe("neural-networks-explained");

    // Verify the wiki page was created
    const page = await readWikiPage("neural-networks-explained");
    expect(page).not.toBeNull();
    expect(page!.content).toContain("# Neural Networks Explained");
    expect(page!.content).toContain("Neural networks are computational models");

    // Verify the index was updated
    const entries = await listWikiPages();
    const entry = entries.find((e) => e.slug === "neural-networks-explained");
    expect(entry).toBeDefined();
    expect(entry!.title).toBe("Neural Networks Explained");
    expect(entry!.summary).toContain("Neural networks are computational models");
  });

  it("wraps saved answer in YAML frontmatter with source and tags", async () => {
    await ensureDirectories();

    await saveAnswerToWiki(
      "Frontmatter Test",
      "This answer should get frontmatter metadata.",
    );

    const parsed = await readWikiPageWithFrontmatter("frontmatter-test");
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.source).toBe("query");
    expect(parsed!.frontmatter.tags).toEqual(["query-answer"]);
    expect(parsed!.frontmatter.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed!.frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not duplicate heading if content already starts with one", async () => {
    await ensureDirectories();

    await saveAnswerToWiki(
      "My Topic",
      "# My Topic\n\nAlready has a heading.",
    );

    const page = await readWikiPage("my-topic");
    expect(page).not.toBeNull();
    // Should not have double heading
    const headingCount = (page!.content.match(/^# /gm) || []).length;
    expect(headingCount).toBe(1);
  });

  it("updates existing index entry on re-save", async () => {
    await ensureDirectories();

    await saveAnswerToWiki("First Version", "Original content.");
    await saveAnswerToWiki("First Version", "Updated content.");

    const entries = await listWikiPages();
    const matching = entries.filter((e) => e.slug === "first-version");
    expect(matching).toHaveLength(1);

    const page = await readWikiPage("first-version");
    expect(page!.content).toContain("Updated content");
  });

  it("throws when title produces an empty slug", async () => {
    await ensureDirectories();

    await expect(saveAnswerToWiki("!!!", "Some content")).rejects.toThrow(
      "valid slug",
    );
  });

  it("cross-references related pages after saving", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    // findRelatedPages will call the LLM and expect a JSON array of slugs
    mockedCallLLM.mockResolvedValue('["react", "nextjs"]');

    // Seed the wiki with two existing pages
    await writeWikiPage(
      "react",
      "# React\n\nReact is a JavaScript framework for building user interfaces.",
    );
    await writeWikiPage(
      "nextjs",
      "# Next.js\n\nNext.js is a JavaScript framework built on top of React.",
    );
    await updateIndex([
      { slug: "react", title: "React", summary: "JavaScript UI framework" },
      { slug: "nextjs", title: "Next.js", summary: "JavaScript framework on React" },
    ]);

    await saveAnswerToWiki(
      "JavaScript Frameworks Overview",
      "Modern JavaScript frameworks like React and Next.js have transformed web development.",
    );

    // The new page should exist
    const newPage = await readWikiPage("javascript-frameworks-overview");
    expect(newPage).not.toBeNull();

    // At least one of the seeded pages should now link back to the new slug
    const reactPage = await readWikiPage("react");
    const nextPage = await readWikiPage("nextjs");
    const reactLinks = reactPage!.content.includes(
      "javascript-frameworks-overview.md",
    );
    const nextLinks = nextPage!.content.includes(
      "javascript-frameworks-overview.md",
    );
    expect(reactLinks || nextLinks).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SCHEMA.md conventions in query prompt
// ---------------------------------------------------------------------------
describe("query — SCHEMA.md conventions", () => {
  it("includes SCHEMA.md conventions in the system prompt when available", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("Answer based on wiki pages.");

    const schemaContent = `# Wiki Schema

## Page conventions

Every page must start with a level-1 heading.

## Operations
`;
    const origCwd = process.cwd();
    const schemaPath = path.join(tmpDir, "SCHEMA.md");
    await fs.writeFile(schemaPath, schemaContent, "utf-8");
    process.chdir(tmpDir);

    try {
      await writeWikiPage(
        "topic-a",
        "# Topic A\n\nA page about topic A with plenty of content for the test.",
      );
      await updateIndex([
        { slug: "topic-a", title: "Topic A", summary: "About topic A" },
      ]);

      await query("What is topic A?");

      expect(mockedCallLLM).toHaveBeenCalled();
      const systemPromptArg = mockedCallLLM.mock.calls[0][0];
      expect(systemPromptArg).toContain("conventions (from SCHEMA.md)");
      expect(systemPromptArg).toContain("Every page must start with a level-1 heading");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("works without SCHEMA.md (no conventions appended)", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("Answer based on wiki pages.");

    // tmpDir has no SCHEMA.md; cwd is unchanged so loadPageConventions
    // reads from the repo root. To guarantee no conventions, chdir to tmpDir.
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      await writeWikiPage(
        "topic-b",
        "# Topic B\n\nA page about topic B with plenty of content for the test.",
      );
      await updateIndex([
        { slug: "topic-b", title: "Topic B", summary: "About topic B" },
      ]);

      await query("What is topic B?");

      expect(mockedCallLLM).toHaveBeenCalled();
      const systemPromptArg = mockedCallLLM.mock.calls[0][0];
      // Should NOT contain SCHEMA conventions since file is missing
      expect(systemPromptArg).not.toContain("conventions (from SCHEMA.md)");
    } finally {
      process.chdir(origCwd);
    }
  });
});

// ---------------------------------------------------------------------------
// loadPageConventions importability
// ---------------------------------------------------------------------------
describe("loadPageConventions — cross-module import", () => {
  it("is importable from ingest.ts and callable", async () => {
    // This test validates that loadPageConventions is properly exported
    // and can be imported from outside ingest.ts
    const { loadPageConventions } = await import("../ingest");
    expect(typeof loadPageConventions).toBe("function");

    // Should return a string (empty is fine when SCHEMA.md is missing)
    const result = await loadPageConventions("/nonexistent/path/SCHEMA.md");
    expect(typeof result).toBe("string");
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractCitedSlugs — citation extraction from answer text
// ---------------------------------------------------------------------------
describe("extractCitedSlugs", () => {
  it("extracts slugs from markdown link patterns", () => {
    const answer = "See [Alpha](alpha.md) and [Beta](beta.md) for details.";
    const result = extractCitedSlugs(answer, ["alpha", "beta", "gamma"]);
    expect(result).toEqual(["alpha", "beta"]);
  });

  it("ignores slugs not in available list", () => {
    const answer = "See [Unknown](unknown.md) for details.";
    const result = extractCitedSlugs(answer, ["alpha", "beta"]);
    expect(result).toEqual([]);
  });

  it("deduplicates repeated citations", () => {
    const answer =
      "See [A](alpha.md) and also [A again](alpha.md) for details.";
    const result = extractCitedSlugs(answer, ["alpha"]);
    expect(result).toEqual(["alpha"]);
  });

  it("returns empty array when no citations found", () => {
    const answer = "No links here, just plain text.";
    const result = extractCitedSlugs(answer, ["alpha", "beta"]);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty answer text", () => {
    const result = extractCitedSlugs("", ["alpha"]);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty available slugs", () => {
    const answer = "See [Alpha](alpha.md).";
    const result = extractCitedSlugs(answer, []);
    expect(result).toEqual([]);
  });

  it("handles slugs with hyphens and numbers", () => {
    const answer =
      "See [Topic](my-topic-2.md) and [Other](page-123.md) for details.";
    const result = extractCitedSlugs(answer, [
      "my-topic-2",
      "page-123",
      "unused",
    ]);
    expect(result).toEqual(["my-topic-2", "page-123"]);
  });

  it("does not match non-md links", () => {
    const answer = "See [Link](https://example.com) and [File](doc.pdf).";
    const result = extractCitedSlugs(answer, ["https://example", "doc"]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion (RRF)
// ---------------------------------------------------------------------------
describe("reciprocalRankFusion", () => {
  it("combines BM25 and vector results using RRF scoring", () => {
    const bm25 = [
      { slug: "alpha", score: 5.0 },
      { slug: "beta", score: 3.0 },
      { slug: "gamma", score: 1.0 },
    ];
    const vector = [
      { slug: "beta", score: 0.95 },
      { slug: "delta", score: 0.85 },
      { slug: "alpha", score: 0.70 },
    ];

    const fused = reciprocalRankFusion(bm25, vector);

    // Both alpha and beta appear in both lists; delta and gamma appear in only one
    expect(fused.length).toBe(4);

    // All slugs should be present
    const slugs = fused.map((r) => r.slug);
    expect(slugs).toContain("alpha");
    expect(slugs).toContain("beta");
    expect(slugs).toContain("gamma");
    expect(slugs).toContain("delta");

    // beta is rank 2 in BM25 and rank 1 in vector — should be boosted
    // alpha is rank 1 in BM25 and rank 3 in vector
    // With k=60: beta RRF = 1/(60+2) + 1/(60+1) ≈ 0.01613 + 0.01639 ≈ 0.03252
    //            alpha RRF = 1/(60+1) + 1/(60+3) ≈ 0.01639 + 0.01587 ≈ 0.03226
    // beta should rank first
    expect(slugs[0]).toBe("beta");
    expect(slugs[1]).toBe("alpha");
  });

  it("handles empty vector results (pure BM25 fallback)", () => {
    const bm25 = [
      { slug: "alpha", score: 5.0 },
      { slug: "beta", score: 3.0 },
    ];

    const fused = reciprocalRankFusion(bm25, []);

    expect(fused.length).toBe(2);
    expect(fused[0].slug).toBe("alpha");
    expect(fused[1].slug).toBe("beta");
  });

  it("handles empty BM25 results (pure vector)", () => {
    const vector = [
      { slug: "alpha", score: 0.9 },
      { slug: "beta", score: 0.8 },
    ];

    const fused = reciprocalRankFusion([], vector);

    expect(fused.length).toBe(2);
    expect(fused[0].slug).toBe("alpha");
    expect(fused[1].slug).toBe("beta");
  });

  it("boosts a page ranked low by BM25 but high by vector search", () => {
    // "delta" is ranked 5th by BM25 but 1st by vector search
    const bm25 = [
      { slug: "a", score: 10 },
      { slug: "b", score: 8 },
      { slug: "c", score: 6 },
      { slug: "d", score: 4 },
      { slug: "delta", score: 2 },
    ];
    const vector = [
      { slug: "delta", score: 0.99 },
      { slug: "a", score: 0.50 },
    ];

    const fused = reciprocalRankFusion(bm25, vector);

    // delta: BM25 rank 5, vector rank 1 → 1/(60+5) + 1/(60+1) ≈ 0.01538 + 0.01639 = 0.03177
    // a:     BM25 rank 1, vector rank 2 → 1/(60+1) + 1/(60+2) ≈ 0.01639 + 0.01613 = 0.03252
    // b:     BM25 rank 2, no vector     → 1/(60+2) + 0         ≈ 0.01613
    // So order should be: a, delta, b, c, d
    const slugs = fused.map((r) => r.slug);
    expect(slugs.indexOf("delta")).toBeLessThan(slugs.indexOf("b"));
    expect(slugs.indexOf("delta")).toBeLessThan(slugs.indexOf("c"));
    expect(slugs.indexOf("delta")).toBeLessThan(slugs.indexOf("d"));
  });

  it("respects custom k parameter", () => {
    const bm25 = [{ slug: "alpha", score: 5.0 }];
    const vector = [{ slug: "alpha", score: 0.9 }];

    const fusedK1 = reciprocalRankFusion(bm25, vector, 1);
    const fusedK60 = reciprocalRankFusion(bm25, vector, 60);

    // With smaller k, rank position matters more → higher scores
    expect(fusedK1[0].score).toBeGreaterThan(fusedK60[0].score);
  });
});

// ---------------------------------------------------------------------------
// Hybrid search integration (searchIndex with vector results)
// ---------------------------------------------------------------------------
describe("hybrid search in searchIndex", () => {
  beforeEach(async () => {
    await ensureDirectories();
  });

  it("falls back to pure BM25 when vector search returns empty", async () => {
    // Set up wiki pages
    const entries: IndexEntry[] = [
      { slug: "ml", title: "Machine Learning", summary: "Overview of ML" },
      { slug: "nn", title: "Neural Networks", summary: "Deep learning networks" },
    ];
    await writeWikiPage("ml", "# Machine Learning\n\nMachine learning overview");
    await writeWikiPage("nn", "# Neural Networks\n\nDeep learning neural networks");
    await updateIndex(entries);

    // searchByVector returns empty (no embedding provider)
    mockedSearchByVector.mockResolvedValue([]);

    const result = await searchIndex("machine learning", entries, false);

    // Should still return BM25 results
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("ml");
  });

  it("uses RRF fusion when vector search returns results", async () => {
    // Create several pages where BM25 and vector disagree on ranking
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha Page", summary: "Alpha content about cats" },
      { slug: "beta", title: "Beta Page", summary: "Beta content about dogs" },
      { slug: "gamma", title: "Gamma Page", summary: "Gamma content about cats and dogs" },
    ];
    await writeWikiPage("alpha", "# Alpha Page\n\nAlpha content about cats");
    await writeWikiPage("beta", "# Beta Page\n\nBeta content about dogs");
    await writeWikiPage("gamma", "# Gamma Page\n\nGamma content about cats and dogs");
    await updateIndex(entries);

    // Vector search says gamma is most relevant
    mockedSearchByVector.mockResolvedValue([
      { slug: "gamma", score: 0.95 },
      { slug: "alpha", score: 0.70 },
      { slug: "beta", score: 0.50 },
    ]);

    const result = await searchIndex("cats", entries, false);

    // With fusion, gamma should be boosted (high in vector, present in BM25)
    expect(result).toContain("gamma");
    expect(result).toContain("alpha");
  });

  it("handles vector search errors gracefully", async () => {
    const entries: IndexEntry[] = [
      { slug: "ml", title: "Machine Learning", summary: "Overview of ML" },
    ];
    await writeWikiPage("ml", "# Machine Learning\n\nMachine learning overview");
    await updateIndex(entries);

    // Vector search throws an error
    mockedSearchByVector.mockRejectedValue(new Error("API error"));

    const result = await searchIndex("machine learning", entries, false);

    // Should fall back to BM25 without crashing
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("ml");
  });
});

// ---------------------------------------------------------------------------
// buildQuerySystemPrompt — answer format hint
// ---------------------------------------------------------------------------
describe("buildQuerySystemPrompt — format option", () => {
  const entries: IndexEntry[] = [
    { slug: "alpha", title: "Alpha", summary: "Alpha summary" },
    { slug: "beta", title: "Beta", summary: "Beta summary" },
  ];

  it("appends the table-formatting instruction when format is 'table'", async () => {
    const prompt = await buildQuerySystemPrompt(
      "context body",
      entries,
      ["alpha"],
      "table",
    );
    expect(prompt).toContain(TABLE_FORMAT_INSTRUCTION);
    expect(prompt).toMatch(/markdown comparison table/i);
  });

  it("omits the table instruction when format is 'prose' (default)", async () => {
    const proseExplicit = await buildQuerySystemPrompt(
      "context body",
      entries,
      ["alpha"],
      "prose",
    );
    const proseDefault = await buildQuerySystemPrompt(
      "context body",
      entries,
      ["alpha"],
    );
    expect(proseExplicit).not.toContain(TABLE_FORMAT_INSTRUCTION);
    expect(proseDefault).not.toContain(TABLE_FORMAT_INSTRUCTION);
    // Default behavior must match explicit "prose" — guards against the
    // default ever drifting away from existing callers' expectations.
    expect(proseDefault).toBe(proseExplicit);
  });
});
