import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { writeWikiPage, updateIndex, ensureDirectories, readLog } from "../wiki";
import type { IndexEntry } from "../types";

// Mock the LLM module so lint never calls the real API
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(async () => "[]"),
}));

import { hasLLMKey, callLLM } from "../llm";
const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

// Import lint after mocking
import { lint } from "../lint";
import {
  extractCrossRefSlugs,
  extractWikiLinks,
  buildClusters,
  parseContradictionResponse,
  checkContradictions,
  parseMissingConceptResponse,
  checkMissingConceptPages,
  checkBrokenLinks,
} from "../lint";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lint-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");

  // Default: no LLM key
  mockedHasLLMKey.mockReturnValue(false);
  mockedCallLLM.mockReset();
  mockedCallLLM.mockResolvedValue("[]");
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

describe("lint", () => {
  it("should return only LLM-skipped info issues for a clean wiki", async () => {
    // Create a page and list it in the index
    await writeWikiPage(
      "hello",
      "# Hello\n\nThis is a page with enough content to pass the empty check easily.",
    );
    const entries: IndexEntry[] = [
      { slug: "hello", title: "Hello", summary: "A greeting page" },
    ];
    await updateIndex(entries);

    const result = await lint();

    // Only the contradiction-skipped and missing-concept-page-skipped info issues (no LLM key)
    const nonLLMSkipped = result.issues.filter(
      (i) => i.type !== "contradiction" && i.type !== "missing-concept-page",
    );
    expect(nonLLMSkipped).toHaveLength(0);
    expect(result.checkedAt).toBeTruthy();
  });

  it("should detect orphan pages (on disk but not in index)", async () => {
    await writeWikiPage(
      "orphan",
      "# Orphan\n\nThis page exists on disk but is not in the index file.",
    );
    // Create an empty index with no entries
    await updateIndex([]);

    const result = await lint();
    const orphanIssues = result.issues.filter((i) => i.type === "orphan-page");

    expect(orphanIssues).toHaveLength(1);
    expect(orphanIssues[0].slug).toBe("orphan");
    expect(orphanIssues[0].severity).toBe("warning");
  });

  it("should detect stale index entries (in index but no file on disk)", async () => {
    await ensureDirectories();
    const entries: IndexEntry[] = [
      { slug: "ghost", title: "Ghost Page", summary: "This file was deleted" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const staleIssues = result.issues.filter((i) => i.type === "stale-index");

    expect(staleIssues).toHaveLength(1);
    expect(staleIssues[0].slug).toBe("ghost");
    expect(staleIssues[0].severity).toBe("error");
  });

  it("should detect empty pages", async () => {
    // Page with only a heading and very little content
    await writeWikiPage("empty", "# Empty Page\n\nHi.");
    const entries: IndexEntry[] = [
      { slug: "empty", title: "Empty Page", summary: "Barely anything here" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const emptyIssues = result.issues.filter((i) => i.type === "empty-page");

    expect(emptyIssues).toHaveLength(1);
    expect(emptyIssues[0].slug).toBe("empty");
    expect(emptyIssues[0].severity).toBe("warning");
  });

  it("should detect missing cross-references", async () => {
    // Page A mentions "Beta Topic" but doesn't link to it
    await writeWikiPage(
      "alpha",
      "# Alpha\n\nThis page discusses Beta Topic extensively and has enough content.",
    );
    await writeWikiPage(
      "beta",
      "# Beta Topic\n\nThis is the beta topic page with enough content to pass checks.",
    );
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha page" },
      { slug: "beta", title: "Beta Topic", summary: "Beta page" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const crossRefIssues = result.issues.filter(
      (i) => i.type === "missing-crossref",
    );

    expect(crossRefIssues.length).toBeGreaterThanOrEqual(1);
    expect(crossRefIssues[0].slug).toBe("alpha");
    expect(crossRefIssues[0].message).toContain("Beta Topic");
  });

  it("should not flag cross-references when links exist", async () => {
    await writeWikiPage(
      "alpha",
      "# Alpha\n\nThis page links to [Beta Topic](beta.md) properly with enough content.",
    );
    await writeWikiPage(
      "beta",
      "# Beta Topic\n\nThis is the beta topic page with enough content to pass checks.",
    );
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha page" },
      { slug: "beta", title: "Beta Topic", summary: "Beta page" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const crossRefIssues = result.issues.filter(
      (i) => i.type === "missing-crossref",
    );

    expect(crossRefIssues).toHaveLength(0);
  });

  it("should not flag index.md or log.md as orphan pages", async () => {
    await ensureDirectories();
    // index.md and log.md exist but shouldn't be flagged
    await updateIndex([]);
    const logPath = path.join(process.env.WIKI_DIR!, "log.md");
    await fs.writeFile(logPath, "[2024-01-01] test entry\n", "utf-8");

    const result = await lint();
    const orphanIssues = result.issues.filter((i) => i.type === "orphan-page");

    expect(orphanIssues).toHaveLength(0);
  });

  it("should return a meaningful summary", async () => {
    await writeWikiPage("orphan", "# Orphan\n\nOrphan page with enough content to not be empty page.");
    await ensureDirectories();
    await updateIndex([
      { slug: "ghost", title: "Ghost", summary: "Missing file" },
    ]);

    const result = await lint();

    // Should have at least an orphan warning and a stale error
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.summary).toMatch(/\d+ issue/);
  });

  it("should handle an empty wiki directory gracefully", async () => {
    await ensureDirectories();

    const result = await lint();

    // Only the LLM-skipped info issues (contradiction + missing-concept-page)
    const nonLLMSkipped = result.issues.filter(
      (i) => i.type !== "contradiction" && i.type !== "missing-concept-page",
    );
    expect(nonLLMSkipped).toHaveLength(0);
  });

  it("should NOT flag cross-refs when short title appears inside other words", async () => {
    // "AI" appears inside "maintain" and "certain" but not as a standalone word
    await writeWikiPage(
      "overview",
      "# Overview\n\nWe need to maintain certain standards across all projects in our domain.",
    );
    await writeWikiPage(
      "ai",
      "# AI\n\nArtificial intelligence is a broad field covering many topics and subtopics.",
    );
    const entries: IndexEntry[] = [
      { slug: "overview", title: "Overview", summary: "Overview page" },
      { slug: "ai", title: "AI", summary: "AI page" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const crossRefIssues = result.issues.filter(
      (i) => i.type === "missing-crossref" && i.message.includes('"AI"'),
    );

    // "AI" should NOT match inside "maintain" or "certain"
    expect(crossRefIssues).toHaveLength(0);
  });

  it("should flag cross-refs when a multi-word title appears as a phrase", async () => {
    await writeWikiPage(
      "intro",
      "# Intro\n\nThis article covers the basics of neural network architectures in depth.",
    );
    await writeWikiPage(
      "neural-network",
      "# Neural Network\n\nA neural network is a computational model inspired by biological neurons.",
    );
    const entries: IndexEntry[] = [
      { slug: "intro", title: "Intro", summary: "Intro page" },
      { slug: "neural-network", title: "Neural Network", summary: "NN page" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const crossRefIssues = result.issues.filter(
      (i) => i.type === "missing-crossref" && i.message.includes("Neural Network"),
    );

    expect(crossRefIssues).toHaveLength(1);
    expect(crossRefIssues[0].slug).toBe("intro");
  });

  it("should NOT flag cross-refs when short title appears as substring of another word", async () => {
    // "go" appears inside "algorithm" but not as a standalone word
    await writeWikiPage(
      "search",
      "# Search\n\nThe algorithm performs a depth-first traversal across the entire graph structure.",
    );
    await writeWikiPage(
      "go-lang",
      "# Go\n\nGo is a programming language designed at Google for systems programming.",
    );
    const entries: IndexEntry[] = [
      { slug: "search", title: "Search", summary: "Search page" },
      { slug: "go-lang", title: "Go", summary: "Go page" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const crossRefIssues = result.issues.filter(
      (i) => i.type === "missing-crossref" && i.message.includes('"Go"'),
    );

    // "Go" should NOT match inside "algorithm" — and it's under 3 chars so also filtered
    expect(crossRefIssues).toHaveLength(0);
  });

  it("should NOT flag cross-refs for 'map' inside 'bitmap'", async () => {
    await writeWikiPage(
      "graphics",
      "# Graphics\n\nBitmap images are composed of a grid of pixels and are resolution dependent.",
    );
    await writeWikiPage(
      "map",
      "# Map\n\nA map is a data structure that stores key-value pairs for efficient lookups.",
    );
    const entries: IndexEntry[] = [
      { slug: "graphics", title: "Graphics", summary: "Graphics page" },
      { slug: "map", title: "Map", summary: "Map page" },
    ];
    await updateIndex(entries);

    const result = await lint();
    const crossRefIssues = result.issues.filter(
      (i) => i.type === "missing-crossref" && i.message.includes('"Map"'),
    );

    // "map" should NOT match inside "bitmap" thanks to word-boundary matching
    expect(crossRefIssues).toHaveLength(0);
  });

  it("appends a 'lint' log entry on every pass", async () => {
    // Set up a small wiki
    await writeWikiPage(
      "alpha",
      "# Alpha\n\nAlpha is a page with enough content to pass the empty check.",
    );
    await writeWikiPage(
      "beta",
      "# Beta\n\nBeta is a page with enough content to pass the empty check.",
    );
    await updateIndex([
      { slug: "alpha", title: "Alpha", summary: "First page" },
      { slug: "beta", title: "Beta", summary: "Second page" },
    ]);

    await lint();

    const log = await readLog();
    expect(log).not.toBeNull();

    // Find the most recent lint entry by walking H2 headings from the end.
    const headings = (log ?? "")
      .split("\n")
      .filter((line) => line.startsWith("## ["));
    expect(headings.length).toBeGreaterThan(0);

    const last = headings[headings.length - 1];
    // Heading shape: "## [YYYY-MM-DD] <op> | <title>"
    expect(last).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] lint \| wiki lint pass$/);
  });

  it("should use page cache to avoid redundant disk reads", async () => {
    // Import the cache size helper to verify caching is active
    const { _getPageCacheSize } = await import("../wiki");

    // Create multiple pages so the cache has something to track
    await writeWikiPage(
      "alpha",
      "# Alpha\n\nAlpha is an important concept. See [Beta](beta.md) for more.",
    );
    await writeWikiPage(
      "beta",
      "# Beta\n\nBeta relates to [Alpha](alpha.md) and expands on gamma.",
    );
    await writeWikiPage(
      "gamma",
      "# Gamma\n\nGamma is a standalone page with enough content to pass checks.",
    );
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha", summary: "Alpha concept" },
      { slug: "beta", title: "Beta", summary: "Beta concept" },
      { slug: "gamma", title: "Gamma", summary: "Gamma concept" },
    ];
    await updateIndex(entries);

    // Spy on fs.readFile to count actual disk reads for .md files
    const origReadFile = fs.readFile;
    let mdReadCount = 0;
    const spy = vi.spyOn(fs, "readFile").mockImplementation(
      async (...args: Parameters<typeof fs.readFile>) => {
        const filePath = String(args[0]);
        if (filePath.endsWith(".md")) {
          mdReadCount++;
        }
        return origReadFile.apply(fs, args);
      },
    );

    const result = await lint();
    spy.mockRestore();

    // There are 3 content pages + index.md + log.md reads.
    // Without page cache, 5 checks × 3 pages = 15 content page reads.
    // With page cache, each page is read from disk at most once = 3 content page reads.
    // Total .md reads should be significantly fewer than without cache.
    // With 3 pages and 5 reading-checks, uncached = 15+ page reads.
    // Cached: 3 unique page reads + index.md reads + log writes.
    // We assert total .md reads are well below the uncached count.
    expect(mdReadCount).toBeLessThan(15);

    // Verify the cache is cleaned up after lint completes
    expect(_getPageCacheSize()).toBe(0);

    expect(result.checkedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Contradiction detection tests
// ---------------------------------------------------------------------------

describe("extractCrossRefSlugs", () => {
  it("extracts slugs from markdown links", () => {
    const content = "See [Alpha](alpha.md) and [Beta](beta.md) for details.";
    const slugs = extractCrossRefSlugs(content);
    expect(slugs).toEqual(new Set(["alpha", "beta"]));
  });

  it("returns empty set when no links", () => {
    const slugs = extractCrossRefSlugs("No links here.");
    expect(slugs.size).toBe(0);
  });
});

describe("buildClusters", () => {
  it("groups linked pages into clusters", () => {
    const pages = [
      { slug: "a", content: "Link to [B](b.md)" },
      { slug: "b", content: "Link to [A](a.md)" },
      { slug: "c", content: "No links here, standalone page" },
    ];
    const clusters = buildClusters(pages);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toContain("a");
    expect(clusters[0]).toContain("b");
  });

  it("returns empty array when no pages link to each other", () => {
    const pages = [
      { slug: "a", content: "No links" },
      { slug: "b", content: "Also no links" },
    ];
    const clusters = buildClusters(pages);
    expect(clusters).toHaveLength(0);
  });

  it("respects maxClusterSize", () => {
    const pages = [
      { slug: "a", content: "[B](b.md) [C](c.md) [D](d.md)" },
      { slug: "b", content: "[A](a.md)" },
      { slug: "c", content: "[A](a.md)" },
      { slug: "d", content: "[A](a.md)" },
    ];
    const clusters = buildClusters(pages, 2);
    // Cluster should be capped at 2
    for (const cluster of clusters) {
      expect(cluster.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("parseContradictionResponse", () => {
  it("parses valid JSON array", () => {
    const response = '[{"pages": ["alpha", "beta"], "description": "Alpha says X, Beta says Y"}]';
    const result = parseContradictionResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].pages).toEqual(["alpha", "beta"]);
    expect(result[0].description).toBe("Alpha says X, Beta says Y");
  });

  it("parses empty array", () => {
    const result = parseContradictionResponse("[]");
    expect(result).toHaveLength(0);
  });

  it("handles markdown code fences", () => {
    const response = '```json\n[{"pages": ["a", "b"], "description": "conflict"}]\n```';
    const result = parseContradictionResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].pages).toEqual(["a", "b"]);
  });

  it("returns empty array for malformed JSON", () => {
    const result = parseContradictionResponse("this is not json at all");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for non-array JSON", () => {
    const result = parseContradictionResponse('{"not": "an array"}');
    expect(result).toHaveLength(0);
  });

  it("skips items missing required fields", () => {
    const response = '[{"pages": ["a"], "description": "only one page"}, {"pages": ["a", "b"], "description": "valid"}]';
    const result = parseContradictionResponse(response);
    // First item has only 1 page, should be skipped
    expect(result).toHaveLength(1);
    expect(result[0].pages).toEqual(["a", "b"]);
  });

  it("skips items with empty description", () => {
    const response = '[{"pages": ["a", "b"], "description": ""}]';
    const result = parseContradictionResponse(response);
    expect(result).toHaveLength(0);
  });
});

describe("checkContradictions", () => {
  it("returns info issue when no LLM key is configured", async () => {
    mockedHasLLMKey.mockReturnValue(false);
    await ensureDirectories();

    const issues = await checkContradictions(["some-slug"]);

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("contradiction");
    expect(issues[0].severity).toBe("info");
    expect(issues[0].message).toContain("skipped");
    expect(issues[0].message).toContain("no LLM API key");
  });

  it("returns contradiction issues when LLM finds them", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    // Create two pages that link to each other
    await writeWikiPage(
      "page-a",
      "# Page A\n\nThe project was founded in 2020. See [Page B](page-b.md).",
    );
    await writeWikiPage(
      "page-b",
      "# Page B\n\nThe project was founded in 2019. See [Page A](page-a.md).",
    );
    await updateIndex([
      { slug: "page-a", title: "Page A", summary: "About the project" },
      { slug: "page-b", title: "Page B", summary: "Also about the project" },
    ]);

    mockedCallLLM.mockResolvedValueOnce(
      '[{"pages": ["page-a", "page-b"], "description": "Page A says founded in 2020, Page B says 2019"}]',
    );

    const issues = await checkContradictions(["page-a", "page-b"]);

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("contradiction");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].slug).toBe("page-a");
    expect(issues[0].message).toContain("page-a");
    expect(issues[0].message).toContain("page-b");
    expect(issues[0].message).toContain("2020");
  });

  it("returns no issues when LLM finds no contradictions", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    await writeWikiPage(
      "consistent-a",
      "# Consistent A\n\nFact: water boils at 100C. See [Consistent B](consistent-b.md).",
    );
    await writeWikiPage(
      "consistent-b",
      "# Consistent B\n\nWater boils at 100 degrees Celsius. See [Consistent A](consistent-a.md).",
    );
    await updateIndex([
      { slug: "consistent-a", title: "Consistent A", summary: "Water facts" },
      { slug: "consistent-b", title: "Consistent B", summary: "Water facts" },
    ]);

    mockedCallLLM.mockResolvedValueOnce("[]");

    const issues = await checkContradictions(["consistent-a", "consistent-b"]);

    expect(issues).toHaveLength(0);
  });

  it("handles malformed LLM response gracefully", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    await writeWikiPage(
      "mal-a",
      "# Malformed A\n\nSome content. See [Malformed B](mal-b.md).",
    );
    await writeWikiPage(
      "mal-b",
      "# Malformed B\n\nSome content. See [Malformed A](mal-a.md).",
    );
    await updateIndex([
      { slug: "mal-a", title: "Malformed A", summary: "Test" },
      { slug: "mal-b", title: "Malformed B", summary: "Test" },
    ]);

    mockedCallLLM.mockResolvedValueOnce(
      "Sorry, I cannot parse these pages properly. Here's some random text.",
    );

    const issues = await checkContradictions(["mal-a", "mal-b"]);

    // Should not crash, just return empty
    expect(issues).toHaveLength(0);
  });

  it("handles LLM call failure gracefully", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    await writeWikiPage(
      "err-a",
      "# Error A\n\nSome content. See [Error B](err-b.md).",
    );
    await writeWikiPage(
      "err-b",
      "# Error B\n\nSome content. See [Error A](err-a.md).",
    );
    await updateIndex([
      { slug: "err-a", title: "Error A", summary: "Test" },
      { slug: "err-b", title: "Error B", summary: "Test" },
    ]);

    mockedCallLLM.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const issues = await checkContradictions(["err-a", "err-b"]);

    // Should not crash, just return empty
    expect(issues).toHaveLength(0);
  });

  it("returns no issues when pages have no cross-references", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    await writeWikiPage(
      "isolated-a",
      "# Isolated A\n\nThis page has no links to other pages at all.",
    );
    await writeWikiPage(
      "isolated-b",
      "# Isolated B\n\nThis page also has no links to other pages.",
    );
    await updateIndex([
      { slug: "isolated-a", title: "Isolated A", summary: "No links" },
      { slug: "isolated-b", title: "Isolated B", summary: "No links" },
    ]);

    const issues = await checkContradictions(["isolated-a", "isolated-b"]);

    // No clusters formed → no LLM calls → no issues
    expect(issues).toHaveLength(0);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("includes SCHEMA.md conventions in contradiction detection prompt", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("[]");

    // Write a temporary SCHEMA.md in tmpDir so loadPageConventions picks it up
    const schemaContent = `# Wiki Schema

## Page conventions

Every page must start with a level-1 heading.

## Operations
`;
    // loadPageConventions reads from process.cwd()/SCHEMA.md by default;
    // we write into tmpDir and temporarily change cwd.
    const origCwd = process.cwd();
    const schemaPath = path.join(tmpDir, "SCHEMA.md");
    await fs.writeFile(schemaPath, schemaContent, "utf-8");
    process.chdir(tmpDir);

    try {
      await writeWikiPage(
        "schema-a",
        "# Schema A\n\nContent about topic. See [Schema B](schema-b.md).",
      );
      await writeWikiPage(
        "schema-b",
        "# Schema B\n\nContent about topic. See [Schema A](schema-a.md).",
      );
      await updateIndex([
        { slug: "schema-a", title: "Schema A", summary: "Test" },
        { slug: "schema-b", title: "Schema B", summary: "Test" },
      ]);

      await checkContradictions(["schema-a", "schema-b"]);

      // The system prompt passed to callLLM should include SCHEMA.md conventions
      expect(mockedCallLLM).toHaveBeenCalled();
      const systemPromptArg = mockedCallLLM.mock.calls[0][0];
      expect(systemPromptArg).toContain("conventions (from SCHEMA.md)");
      expect(systemPromptArg).toContain("Every page must start with a level-1 heading");
    } finally {
      process.chdir(origCwd);
    }
  });

  // ── Missing concept page detection ──────────────────────────────────

  describe("parseMissingConceptResponse", () => {
    it("parses valid JSON array of concept objects", () => {
      const input = JSON.stringify([
        {
          concept: "Transformer",
          mentioned_in: ["attention", "gpt"],
          reason: "Core architecture mentioned in multiple pages",
        },
        {
          concept: "Backpropagation",
          mentioned_in: ["training", "gradients"],
          reason: "Fundamental training algorithm",
        },
      ]);
      const result = parseMissingConceptResponse(input);
      expect(result).toHaveLength(2);
      expect(result[0].concept).toBe("Transformer");
      expect(result[0].mentioned_in).toEqual(["attention", "gpt"]);
      expect(result[0].reason).toBe("Core architecture mentioned in multiple pages");
      expect(result[1].concept).toBe("Backpropagation");
    });

    it("returns empty array for malformed JSON", () => {
      expect(parseMissingConceptResponse("not json")).toEqual([]);
      expect(parseMissingConceptResponse("{invalid")).toEqual([]);
    });

    it("returns empty array for empty JSON array", () => {
      expect(parseMissingConceptResponse("[]")).toEqual([]);
    });

    it("strips markdown code fences", () => {
      const input = '```json\n[{"concept":"X","mentioned_in":["a","b"],"reason":"Y"}]\n```';
      const result = parseMissingConceptResponse(input);
      expect(result).toHaveLength(1);
      expect(result[0].concept).toBe("X");
    });

    it("filters out items with less than 2 mentioned_in entries", () => {
      const input = JSON.stringify([
        {
          concept: "Only Once",
          mentioned_in: ["single-page"],
          reason: "Mentioned in just one page",
        },
      ]);
      const result = parseMissingConceptResponse(input);
      expect(result).toEqual([]);
    });

    it("filters out items with missing fields", () => {
      const input = JSON.stringify([
        { concept: "No reason", mentioned_in: ["a", "b"] },
        { concept: "", mentioned_in: ["a", "b"], reason: "empty concept" },
        { mentioned_in: ["a", "b"], reason: "no concept field" },
      ]);
      const result = parseMissingConceptResponse(input);
      expect(result).toEqual([]);
    });
  });

  describe("checkMissingConceptPages", () => {
    it("returns info-level skip message when no LLM key is configured", async () => {
      mockedHasLLMKey.mockReturnValue(false);
      await ensureDirectories();

      const issues = await checkMissingConceptPages(["page-a", "page-b"]);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("missing-concept-page");
      expect(issues[0].severity).toBe("info");
      expect(issues[0].message).toContain("skipped");
      expect(mockedCallLLM).not.toHaveBeenCalled();
    });

    it("returns empty array when fewer than 2 pages exist", async () => {
      mockedHasLLMKey.mockReturnValue(true);

      await writeWikiPage("solo", "# Solo Page\n\nJust one page with enough content.");

      const issues = await checkMissingConceptPages(["solo"]);
      expect(issues).toEqual([]);
      expect(mockedCallLLM).not.toHaveBeenCalled();
    });

    it("returns missing-concept-page issues when LLM identifies concepts", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockResolvedValue(
        JSON.stringify([
          {
            concept: "Neural Networks",
            mentioned_in: ["deep-learning", "backprop"],
            reason: "Fundamental concept discussed across multiple pages",
          },
        ]),
      );

      await writeWikiPage(
        "deep-learning",
        "# Deep Learning\n\nDeep learning uses neural networks for complex tasks.",
      );
      await writeWikiPage(
        "backprop",
        "# Backpropagation\n\nBackpropagation trains neural networks using gradients.",
      );

      const issues = await checkMissingConceptPages(["deep-learning", "backprop"]);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("missing-concept-page");
      expect(issues[0].slug).toBe("deep-learning");
      expect(issues[0].message).toContain("Neural Networks");
      expect(issues[0].severity).toBe("info");
    });

    it("returns empty array when LLM returns empty array", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockResolvedValue("[]");

      await writeWikiPage(
        "page-a",
        "# Page A\n\nSome content about a specific topic that is self-contained.",
      );
      await writeWikiPage(
        "page-b",
        "# Page B\n\nAnother page with completely different content and context.",
      );

      const issues = await checkMissingConceptPages(["page-a", "page-b"]);
      expect(issues).toEqual([]);
    });

    it("handles LLM call failure gracefully", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockRejectedValue(new Error("API error"));

      await writeWikiPage(
        "fail-a",
        "# Fail A\n\nContent for page A with enough text to pass checks.",
      );
      await writeWikiPage(
        "fail-b",
        "# Fail B\n\nContent for page B with enough text to pass checks.",
      );

      const issues = await checkMissingConceptPages(["fail-a", "fail-b"]);
      expect(issues).toEqual([]);
    });
  });

  it("lint result includes missing-concept-page issues when LLM is available", async () => {
    mockedHasLLMKey.mockReturnValue(true);

    // Both checks run in parallel via Promise.all, so call order is
    // non-deterministic. Dispatch based on the system prompt content instead.
    const missingConceptResponse = JSON.stringify([
      {
        concept: "Attention Mechanism",
        mentioned_in: ["transformer", "bert"],
        reason: "Core concept in both pages",
      },
    ]);
    mockedCallLLM.mockImplementation(async (systemPrompt: string) => {
      if (systemPrompt.includes("knowledge gap detector")) {
        return missingConceptResponse;
      }
      return "[]"; // contradiction check returns empty
    });

    await writeWikiPage(
      "transformer",
      "# Transformer\n\nThe transformer architecture uses attention mechanism for sequence modeling. See [BERT](bert.md).",
    );
    await writeWikiPage(
      "bert",
      "# BERT\n\nBERT builds on the transformer with bidirectional attention mechanism. See [Transformer](transformer.md).",
    );
    await updateIndex([
      { slug: "transformer", title: "Transformer", summary: "Test" },
      { slug: "bert", title: "BERT", summary: "Test" },
    ]);

    const result = await lint();
    const conceptIssues = result.issues.filter(
      (i) => i.type === "missing-concept-page",
    );
    expect(conceptIssues.length).toBeGreaterThanOrEqual(1);
    expect(conceptIssues[0].message).toContain("Attention Mechanism");
  });

  describe("checkBrokenLinks", () => {
    it("should detect a link to a non-existent page", async () => {
      await writeWikiPage(
        "page-a",
        '# Page A\n\nThis links to [Missing Page](nonexistent.md) which does not exist.',
      );
      await updateIndex([
        { slug: "page-a", title: "Page A", summary: "Test" },
      ]);

      const issues = await checkBrokenLinks(["page-a"]);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("broken-link");
      expect(issues[0].slug).toBe("page-a");
      expect(issues[0].severity).toBe("warning");
      expect(issues[0].message).toContain("nonexistent.md");
    });

    it("should not flag links to existing pages", async () => {
      await writeWikiPage(
        "page-a",
        '# Page A\n\nThis links to [Page B](page-b.md) which exists.',
      );
      await writeWikiPage(
        "page-b",
        "# Page B\n\nThis is page B with enough content to pass checks.",
      );

      const issues = await checkBrokenLinks(["page-a", "page-b"]);
      expect(issues).toHaveLength(0);
    });

    it("should produce one issue per broken link when multiple exist", async () => {
      await writeWikiPage(
        "page-a",
        '# Page A\n\nLinks to [Gone 1](gone-one.md) and [Gone 2](gone-two.md) and [Exists](page-b.md).',
      );
      await writeWikiPage(
        "page-b",
        "# Page B\n\nThis is page B with enough content to pass checks.",
      );

      const issues = await checkBrokenLinks(["page-a", "page-b"]);
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("gone-one.md"),
          expect.stringContaining("gone-two.md"),
        ]),
      );
    });

    it("should not flag links to infrastructure files (index.md, log.md)", async () => {
      await writeWikiPage(
        "page-a",
        '# Page A\n\nLinks to [Index](index.md) and [Log](log.md) which are infrastructure.',
      );

      const issues = await checkBrokenLinks(["page-a"]);
      expect(issues).toHaveLength(0);
    });
  });

  it("lint result includes broken-link issues", async () => {
    await writeWikiPage(
      "linker",
      '# Linker\n\nThis page links to [Missing](does-not-exist.md) which is broken.',
    );
    await updateIndex([
      { slug: "linker", title: "Linker", summary: "Test" },
    ]);

    const result = await lint();
    const brokenLinkIssues = result.issues.filter(
      (i) => i.type === "broken-link",
    );
    expect(brokenLinkIssues).toHaveLength(1);
    expect(brokenLinkIssues[0].slug).toBe("linker");
    expect(brokenLinkIssues[0].message).toContain("does-not-exist.md");
  });
});

// ---------------------------------------------------------------------------
// extractWikiLinks
// ---------------------------------------------------------------------------

describe("extractWikiLinks", () => {
  it("returns empty array when no links are present", () => {
    expect(extractWikiLinks("Just some plain text.")).toEqual([]);
  });

  it("extracts a single wiki link", () => {
    const content = "See [My Page](my-page.md) for details.";
    expect(extractWikiLinks(content)).toEqual([
      { text: "My Page", targetSlug: "my-page" },
    ]);
  });

  it("extracts multiple wiki links", () => {
    const content = "See [Alpha](alpha.md) and [Beta](beta.md) and [Gamma](gamma.md).";
    expect(extractWikiLinks(content)).toEqual([
      { text: "Alpha", targetSlug: "alpha" },
      { text: "Beta", targetSlug: "beta" },
      { text: "Gamma", targetSlug: "gamma" },
    ]);
  });

  it("handles link text with special characters", () => {
    const content = 'Check [What\'s New? (2024)](whats-new-2024.md) here.';
    expect(extractWikiLinks(content)).toEqual([
      { text: "What's New? (2024)", targetSlug: "whats-new-2024" },
    ]);
  });

  it("handles slugs with hyphens and numbers", () => {
    const content = "Link to [Page 42](some-page-42.md).";
    expect(extractWikiLinks(content)).toEqual([
      { text: "Page 42", targetSlug: "some-page-42" },
    ]);
  });

  it("does not match non-.md links", () => {
    const content = "Visit [Google](https://google.com) for search.";
    expect(extractWikiLinks(content)).toEqual([]);
  });

  it("handles empty link text", () => {
    const content = "An empty link [](target.md) here.";
    expect(extractWikiLinks(content)).toEqual([
      { text: "", targetSlug: "target" },
    ]);
  });
});
