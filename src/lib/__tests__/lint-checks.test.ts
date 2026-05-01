import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Import directly from lint-checks (not via lint)
import {
  getOnDiskSlugs,
  checkOrphanPages,
  checkStaleIndex,
  checkEmptyPages,
  checkBrokenLinks,
  checkMissingCrossRefs,
  checkStalePages,
  checkLowConfidence,
  LOW_CONFIDENCE_THRESHOLD,
  buildSummary,
} from "../lint-checks";
import type { LintIssue } from "../types";

// We use writeWikiPage / ensureDirectories to set up wiki pages on disk.
import { writeWikiPage, updateIndex, ensureDirectories } from "../wiki";
import { serializeFrontmatter } from "../frontmatter";
import type { IndexEntry } from "../types";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lint-checks-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  await ensureDirectories();
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
// getOnDiskSlugs
// ---------------------------------------------------------------------------
describe("getOnDiskSlugs", () => {
  it("returns slugs from .md files excluding index.md and log.md", async () => {
    const wikiDir = process.env.WIKI_DIR!;
    await fs.writeFile(path.join(wikiDir, "alpha.md"), "# Alpha\n\nContent");
    await fs.writeFile(path.join(wikiDir, "beta.md"), "# Beta\n\nContent");
    await fs.writeFile(path.join(wikiDir, "index.md"), "# Index\n\n- alpha");
    await fs.writeFile(path.join(wikiDir, "log.md"), "# Log\n\n- entry");

    const slugs = await getOnDiskSlugs(wikiDir);
    expect(slugs.sort()).toEqual(["alpha", "beta"]);
  });

  it("returns empty array when directory does not exist", async () => {
    const slugs = await getOnDiskSlugs(path.join(tmpDir, "nonexistent"));
    expect(slugs).toEqual([]);
  });

  it("ignores non-.md files", async () => {
    const wikiDir = process.env.WIKI_DIR!;
    await fs.writeFile(path.join(wikiDir, "page.md"), "# Page\n\nContent");
    await fs.writeFile(path.join(wikiDir, "readme.txt"), "Not a wiki page");
    await fs.writeFile(path.join(wikiDir, "data.json"), "{}");
    await fs.writeFile(path.join(wikiDir, ".hidden"), "secret");

    const slugs = await getOnDiskSlugs(wikiDir);
    expect(slugs).toEqual(["page"]);
  });

  it("returns empty array for an empty directory", async () => {
    const wikiDir = process.env.WIKI_DIR!;
    const slugs = await getOnDiskSlugs(wikiDir);
    expect(slugs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkOrphanPages
// ---------------------------------------------------------------------------
describe("checkOrphanPages", () => {
  it("returns issues for slugs on disk but not in index", async () => {
    const diskSlugs = ["alpha", "beta", "gamma"];
    const indexSlugs = new Set(["alpha"]);

    const issues = await checkOrphanPages(diskSlugs, indexSlugs);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.type === "orphan-page")).toBe(true);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
    expect(issues.map((i) => i.slug).sort()).toEqual(["beta", "gamma"]);
  });

  it("populates suggestion field for orphan pages", async () => {
    const issues = await checkOrphanPages(["orphaned"], new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toBeDefined();
    expect(issues[0].suggestion).toContain("orphaned");
  });

  it("returns empty array when all slugs are in index", async () => {
    const diskSlugs = ["alpha", "beta"];
    const indexSlugs = new Set(["alpha", "beta"]);

    const issues = await checkOrphanPages(diskSlugs, indexSlugs);
    expect(issues).toEqual([]);
  });

  it("returns empty array for empty inputs", async () => {
    const issues = await checkOrphanPages([], new Set());
    expect(issues).toEqual([]);
  });

  it("returns empty array for empty disk slugs with populated index", async () => {
    const issues = await checkOrphanPages([], new Set(["alpha", "beta"]));
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkStaleIndex
// ---------------------------------------------------------------------------
describe("checkStaleIndex", () => {
  it("returns issues for index slugs with no disk file", async () => {
    const indexSlugs = new Set(["alpha", "beta", "gamma"]);
    const diskSlugs = new Set(["alpha"]);

    const issues = await checkStaleIndex(indexSlugs, diskSlugs);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.type === "stale-index")).toBe(true);
    expect(issues.every((i) => i.severity === "error")).toBe(true);
    expect(issues.map((i) => i.slug).sort()).toEqual(["beta", "gamma"]);
  });

  it("populates suggestion field for stale index entries", async () => {
    const issues = await checkStaleIndex(new Set(["my-topic"]), new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toBeDefined();
    expect(issues[0].suggestion).toContain("my topic");
  });

  it("returns empty array when all index slugs exist on disk", async () => {
    const indexSlugs = new Set(["alpha", "beta"]);
    const diskSlugs = new Set(["alpha", "beta", "extra"]);

    const issues = await checkStaleIndex(indexSlugs, diskSlugs);
    expect(issues).toEqual([]);
  });

  it("returns empty array for empty inputs", async () => {
    const issues = await checkStaleIndex(new Set(), new Set());
    expect(issues).toEqual([]);
  });

  it("returns issues for all entries when disk is empty", async () => {
    const indexSlugs = new Set(["a", "b"]);
    const diskSlugs = new Set<string>();

    const issues = await checkStaleIndex(indexSlugs, diskSlugs);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.slug).sort()).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// checkEmptyPages
// ---------------------------------------------------------------------------
describe("checkEmptyPages", () => {
  it("detects pages with very little content (just a heading)", async () => {
    await writeWikiPage("empty-page", "# Empty Page\n\n");

    const issues = await checkEmptyPages(["empty-page"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("empty-page");
    expect(issues[0].slug).toBe("empty-page");
    expect(issues[0].severity).toBe("warning");
  });

  it("populates suggestion field for empty pages", async () => {
    await writeWikiPage("sparse-topic", "# Sparse Topic\n\n");

    const issues = await checkEmptyPages(["sparse-topic"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toBeDefined();
    expect(issues[0].suggestion).toContain("Sparse Topic");
    expect(issues[0].suggestion).toContain("ingest");
  });

  it("passes pages with substantial content", async () => {
    await writeWikiPage(
      "good-page",
      "# Good Page\n\nThis is a page with plenty of meaningful content that should easily pass the empty check threshold of fifty characters.",
    );

    const issues = await checkEmptyPages(["good-page"]);
    expect(issues).toEqual([]);
  });

  it("detects pages with only a heading and a few words", async () => {
    await writeWikiPage("short-page", "# Short Page\n\nToo short.");

    const issues = await checkEmptyPages(["short-page"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].slug).toBe("short-page");
  });

  it("handles missing files gracefully (skips them)", async () => {
    // "nonexistent" slug has no file on disk
    const issues = await checkEmptyPages(["nonexistent"]);
    expect(issues).toEqual([]);
  });

  it("returns empty array for empty input", async () => {
    const issues = await checkEmptyPages([]);
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkBrokenLinks
// ---------------------------------------------------------------------------
describe("checkBrokenLinks", () => {
  it("detects links to non-existent pages", async () => {
    await writeWikiPage(
      "source",
      "# Source\n\nThis links to [Missing](missing.md) which does not exist on disk.",
    );

    const issues = await checkBrokenLinks(["source"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("broken-link");
    expect(issues[0].slug).toBe("source");
    expect(issues[0].target).toBe("missing");
    expect(issues[0].severity).toBe("warning");
  });

  it("populates suggestion field for broken links", async () => {
    await writeWikiPage(
      "linker",
      "# Linker\n\nSee [Deep Learning](deep-learning.md) for more details on the topic.",
    );

    const issues = await checkBrokenLinks(["linker"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toBeDefined();
    expect(issues[0].suggestion).toContain("deep learning");
    expect(issues[0].suggestion).toContain("Create");
  });

  it("does not flag links to existing pages", async () => {
    await writeWikiPage(
      "source",
      "# Source\n\nThis links to [Target](target.md) which exists.",
    );
    await writeWikiPage(
      "target",
      "# Target\n\nThis is the target page with enough content to pass all checks.",
    );

    const issues = await checkBrokenLinks(["source", "target"]);
    expect(issues).toEqual([]);
  });

  it("skips links to infrastructure files (index.md, log.md)", async () => {
    await writeWikiPage(
      "page",
      "# Page\n\nSee the [index](index.md) and [log](log.md) for details.",
    );

    const issues = await checkBrokenLinks(["page"]);
    expect(issues).toEqual([]);
  });

  it("returns empty array when pages have no links", async () => {
    await writeWikiPage(
      "plain",
      "# Plain\n\nThis page has no wiki links at all, just plain text content.",
    );

    const issues = await checkBrokenLinks(["plain"]);
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkMissingCrossRefs
// ---------------------------------------------------------------------------
describe("checkMissingCrossRefs", () => {
  it("detects when page A mentions a term that is slug B's title but does not link to B", async () => {
    await writeWikiPage(
      "machine-learning",
      "# Machine Learning\n\nMachine learning is a subfield of artificial intelligence that uses neural networks to learn patterns from data.",
    );
    await writeWikiPage(
      "neural-networks",
      "# Neural Networks\n\nNeural networks are computational models inspired by the human brain.",
    );

    const issues = await checkMissingCrossRefs(["machine-learning", "neural-networks"]);
    // "machine-learning" mentions "neural networks" but doesn't link to it
    const crossRefIssues = issues.filter(
      (i) => i.slug === "machine-learning" && i.target === "neural-networks",
    );
    expect(crossRefIssues).toHaveLength(1);
    expect(crossRefIssues[0].type).toBe("missing-crossref");
    expect(crossRefIssues[0].severity).toBe("info");
  });

  it("populates suggestion field for missing cross-refs", async () => {
    await writeWikiPage(
      "overview",
      "# Overview\n\nThis page covers transformers and how they relate to modern language models.",
    );
    await writeWikiPage(
      "transformers",
      "# Transformers\n\nTransformers are a neural network architecture using self-attention mechanisms.",
    );

    const issues = await checkMissingCrossRefs(["overview", "transformers"]);
    const crossRefIssues = issues.filter(
      (i) => i.slug === "overview" && i.target === "transformers",
    );
    expect(crossRefIssues).toHaveLength(1);
    expect(crossRefIssues[0].suggestion).toBeDefined();
    expect(crossRefIssues[0].suggestion).toContain("Transformers");
    expect(crossRefIssues[0].suggestion).toContain("transformers.md");
  });

  it("does NOT flag partial matches inside larger words", async () => {
    // "map" should not match inside "bitmap"
    await writeWikiPage(
      "graphics",
      "# Graphics\n\nWe use a bitmap to store pixel data for the rendering pipeline and other operations.",
    );
    await writeWikiPage(
      "map",
      "# Map\n\nA map is a data structure for key-value pairs used in many algorithms.",
    );

    const issues = await checkMissingCrossRefs(["graphics", "map"]);
    // "bitmap" contains "map" but word-boundary matching should prevent this
    const falsePositives = issues.filter(
      (i) => i.slug === "graphics" && i.target === "map",
    );
    expect(falsePositives).toHaveLength(0);
  });

  it("does not flag when a link already exists", async () => {
    await writeWikiPage(
      "overview",
      "# Overview\n\nThis article covers [Python](python.md) programming language features extensively.",
    );
    await writeWikiPage(
      "python",
      "# Python\n\nPython is a high-level programming language used widely in data science.",
    );

    const issues = await checkMissingCrossRefs(["overview", "python"]);
    const crossRefIssues = issues.filter(
      (i) => i.slug === "overview" && i.target === "python",
    );
    expect(crossRefIssues).toHaveLength(0);
  });

  it("handles pages with no potential cross-refs", async () => {
    await writeWikiPage(
      "lonely",
      "# Lonely\n\nThis page stands on its own with content that doesn't reference any other topic.",
    );

    const issues = await checkMissingCrossRefs(["lonely"]);
    expect(issues).toEqual([]);
  });

  it("ignores titles shorter than 3 characters", async () => {
    await writeWikiPage(
      "article",
      "# Article\n\nThis text mentions AI several times: AI is great, AI is the future.",
    );
    await writeWikiPage(
      "ai",
      "# AI\n\nArtificial intelligence overview with enough content for validation.",
    );

    const issues = await checkMissingCrossRefs(["article", "ai"]);
    // "AI" is only 2 chars — should be ignored to avoid false positives
    const crossRefIssues = issues.filter(
      (i) => i.slug === "article" && i.target === "ai",
    );
    expect(crossRefIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSummary
// ---------------------------------------------------------------------------
describe("buildSummary", () => {
  it("returns clean message for empty array", () => {
    const summary = buildSummary([]);
    expect(summary).toBe("Wiki is clean — no issues found.");
  });

  it("returns correct counts for a single error", () => {
    const issues: LintIssue[] = [
      { type: "stale-index", slug: "a", message: "stale", severity: "error" },
    ];
    const summary = buildSummary(issues);
    expect(summary).toBe("Found 1 issue: 1 error.");
  });

  it("returns correct counts for mixed severity issues", () => {
    const issues: LintIssue[] = [
      { type: "stale-index", slug: "a", message: "stale", severity: "error" },
      { type: "stale-index", slug: "b", message: "stale", severity: "error" },
      { type: "orphan-page", slug: "c", message: "orphan", severity: "warning" },
      { type: "missing-crossref", slug: "d", message: "missing", severity: "info" },
      { type: "missing-crossref", slug: "e", message: "missing", severity: "info" },
      { type: "missing-crossref", slug: "f", message: "missing", severity: "info" },
    ];
    const summary = buildSummary(issues);
    expect(summary).toBe("Found 6 issues: 2 errors, 1 warning, 3 infos.");
  });

  it("handles only warnings", () => {
    const issues: LintIssue[] = [
      { type: "orphan-page", slug: "a", message: "orphan", severity: "warning" },
      { type: "orphan-page", slug: "b", message: "orphan", severity: "warning" },
    ];
    const summary = buildSummary(issues);
    expect(summary).toBe("Found 2 issues: 2 warnings.");
  });

  it("handles only infos", () => {
    const issues: LintIssue[] = [
      { type: "missing-crossref", slug: "a", message: "info issue", severity: "info" },
    ];
    const summary = buildSummary(issues);
    expect(summary).toBe("Found 1 issue: 1 info.");
  });

  it("pluralizes correctly for single items", () => {
    const issues: LintIssue[] = [
      { type: "stale-index", slug: "a", message: "stale", severity: "error" },
      { type: "orphan-page", slug: "b", message: "orphan", severity: "warning" },
      { type: "missing-crossref", slug: "c", message: "info", severity: "info" },
    ];
    const summary = buildSummary(issues);
    expect(summary).toBe("Found 3 issues: 1 error, 1 warning, 1 info.");
  });
});

// ---------------------------------------------------------------------------
// Helper: create a wiki page with frontmatter and add it to the index
// ---------------------------------------------------------------------------

/** Accumulator for index entries within a single test. */
let _testIndexEntries: IndexEntry[] = [];

/** Reset between tests so entries don't leak. */
const _originalBeforeEach = beforeEach;

// Insert a cleanup step at the start of each test.
_originalBeforeEach(() => {
  _testIndexEntries = [];
});

async function createPageWithIndex(
  slug: string,
  title: string,
  frontmatter: Record<string, string | string[] | number | boolean>,
  body?: string,
): Promise<void> {
  const md = body ?? `# ${title}\n\nContent for ${title} with enough text for validation.`;
  const content = serializeFrontmatter(frontmatter, md);
  await writeWikiPage(slug, content);
  _testIndexEntries.push({ slug, title, summary: `About ${title}` });
  await updateIndex(_testIndexEntries);
}

// ---------------------------------------------------------------------------
// checkStalePages
// ---------------------------------------------------------------------------
describe("checkStalePages", () => {
  it("flags a page whose expiry is in the past", async () => {
    await createPageWithIndex("old-news", "Old News", {
      expiry: "2020-01-01",
      created: "2019-01-01",
    });

    const issues = await checkStalePages();
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("stale-page");
    expect(issues[0].slug).toBe("old-news");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("2020-01-01");
    expect(issues[0].suggestion).toBeDefined();
  });

  it("does NOT flag a page whose expiry is in the future", async () => {
    await createPageWithIndex("fresh-page", "Fresh Page", {
      expiry: "2099-12-31",
      created: "2025-01-01",
    });

    const issues = await checkStalePages();
    expect(issues).toHaveLength(0);
  });

  it("gracefully skips pages with no expiry field", async () => {
    await createPageWithIndex("no-expiry", "No Expiry", {
      created: "2025-01-01",
    });

    const issues = await checkStalePages();
    expect(issues).toHaveLength(0);
  });

  it("flags multiple stale pages", async () => {
    await createPageWithIndex("stale-a", "Stale A", { expiry: "2020-06-01" });
    await createPageWithIndex("stale-b", "Stale B", { expiry: "2021-03-15" });
    await createPageWithIndex("fresh-c", "Fresh C", { expiry: "2099-01-01" });

    const issues = await checkStalePages();
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.slug).sort()).toEqual(["stale-a", "stale-b"]);
  });
});

// ---------------------------------------------------------------------------
// checkLowConfidence
// ---------------------------------------------------------------------------
describe("checkLowConfidence", () => {
  it("flags a page with confidence below the threshold", async () => {
    await createPageWithIndex("shaky-page", "Shaky Page", {
      confidence: 0.1,
      created: "2025-01-01",
    });

    const issues = await checkLowConfidence();
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("low-confidence");
    expect(issues[0].slug).toBe("shaky-page");
    expect(issues[0].severity).toBe("info");
    expect(issues[0].message).toContain("0.1");
    expect(issues[0].message).toContain(String(LOW_CONFIDENCE_THRESHOLD));
    expect(issues[0].suggestion).toBeDefined();
    expect(issues[0].suggestion).toContain("Shaky Page");
  });

  it("does NOT flag a page with confidence above the threshold", async () => {
    await createPageWithIndex("solid-page", "Solid Page", {
      confidence: 0.5,
      created: "2025-01-01",
    });

    const issues = await checkLowConfidence();
    expect(issues).toHaveLength(0);
  });

  it("gracefully skips pages with no confidence field", async () => {
    await createPageWithIndex("no-confidence", "No Confidence", {
      created: "2025-01-01",
    });

    const issues = await checkLowConfidence();
    expect(issues).toHaveLength(0);
  });

  it("does NOT flag a page with confidence exactly at the threshold", async () => {
    await createPageWithIndex("borderline", "Borderline", {
      confidence: LOW_CONFIDENCE_THRESHOLD,
      created: "2025-01-01",
    });

    const issues = await checkLowConfidence();
    expect(issues).toHaveLength(0);
  });

  it("flags confidence of 0", async () => {
    await createPageWithIndex("zero-conf", "Zero Confidence", {
      confidence: 0,
      created: "2025-01-01",
    });

    const issues = await checkLowConfidence();
    expect(issues).toHaveLength(1);
    expect(issues[0].slug).toBe("zero-conf");
  });
});
