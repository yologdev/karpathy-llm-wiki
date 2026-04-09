import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { searchIndex, buildContext, query, saveAnswerToWiki, buildCorpusStats, bm25Score } from "../query";
import { writeWikiPage, updateIndex, ensureDirectories, readWikiPage, listWikiPages } from "../wiki";
import type { IndexEntry } from "../types";

// ---------------------------------------------------------------------------
// Mock callLLM and hasLLMKey so tests don't require real API keys
// ---------------------------------------------------------------------------
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(async () => "mocked response"),
}));

import { hasLLMKey, callLLM } from "../llm";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

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
  it("buildCorpusStats handles an empty corpus safely", () => {
    const stats = buildCorpusStats([]);
    expect(stats.N).toBe(0);
    expect(stats.avgdl).toBe(0);
    expect(stats.df.size).toBe(0);
    expect(stats.docTokens.size).toBe(0);
  });

  it("bm25Score returns 0 for empty query tokens (no NaN)", () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Some content here" },
      { slug: "beta", title: "Beta", summary: "Other content here" },
    ];
    const stats = buildCorpusStats(entries);
    const score = bm25Score(entries[0], [], stats);
    expect(score).toBe(0);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("bm25Score returns 0 against an empty corpus without throwing", () => {
    const entry: IndexEntry = { slug: "x", title: "X", summary: "X" };
    const stats = buildCorpusStats([]);
    const score = bm25Score(entry, ["anything"], stats);
    expect(score).toBe(0);
  });

  it("ranks rarer terms higher via IDF (beats substring counting)", () => {
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

    const stats = buildCorpusStats(entries);
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

  it("produces deterministic ranking on a handcrafted corpus", () => {
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

    const stats = buildCorpusStats(entries);
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

  it("penalizes longer documents via length normalization", () => {
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

    const stats = buildCorpusStats(entries);
    const q = tokenizeForTest("widget");

    const shortScore = bm25Score(entries[0], q, stats);
    const longScore = bm25Score(entries[1], q, stats);

    expect(shortScore).toBeGreaterThan(0);
    expect(longScore).toBeGreaterThan(0);
    expect(shortScore).toBeGreaterThan(longScore);
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

  it("uses LLM when available and parses JSON response", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue('["neural-networks", "deep-learning"]');

    const entries: IndexEntry[] = [
      { slug: "neural-networks", title: "Neural Networks", summary: "NN overview" },
      { slug: "deep-learning", title: "Deep Learning", summary: "DL overview" },
      { slug: "cooking", title: "Cooking", summary: "Food preparation" },
    ];

    const result = await searchIndex("How do neural networks learn?", entries);

    expect(result).toEqual(["neural-networks", "deep-learning"]);
    expect(mockedCallLLM).toHaveBeenCalledOnce();
  });

  it("falls back to keywords when LLM returns invalid JSON", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("I think you should look at neural networks");

    const entries: IndexEntry[] = [
      { slug: "neural-networks", title: "Neural Networks", summary: "NN architectures overview" },
      { slug: "cooking", title: "Cooking", summary: "Food preparation tips" },
    ];

    const result = await searchIndex("neural network architectures", entries);

    // Should fall back to keyword matching
    expect(result).toContain("neural-networks");
  });

  it("falls back to keywords when LLM call throws", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockRejectedValue(new Error("API error"));

    const entries: IndexEntry[] = [
      { slug: "python", title: "Python", summary: "Python programming language" },
    ];

    const result = await searchIndex("Python programming", entries);

    expect(result).toContain("python");
  });

  it("filters out invalid slugs from LLM response", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue('["valid-slug", "nonexistent-slug"]');

    const entries: IndexEntry[] = [
      { slug: "valid-slug", title: "Valid", summary: "A valid page" },
    ];

    const result = await searchIndex("test question", entries);

    expect(result).toEqual(["valid-slug"]);
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

    // First call is searchIndex, second is the actual query
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

    // Should have called LLM twice: once for index search, once for answer
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
