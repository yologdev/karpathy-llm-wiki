import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  readWikiPage,
  writeWikiPage,
  listWikiPages,
  updateIndex,
  saveRawSource,
  appendToLog,
  readLog,
  ensureDirectories,
  validateSlug,
  writeWikiPageWithSideEffects,
  deleteWikiPage,
  parseFrontmatter,
  serializeFrontmatter,
  readWikiPageWithFrontmatter,
  listRawSources,
  readRawSource,
} from "../wiki";
import type { IndexEntry } from "../types";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-test-"));
  // Point wiki.ts at our temp directories via env vars
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
});

afterEach(async () => {
  // Restore original env vars
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
  // Clean up temp dir
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ensureDirectories", () => {
  it("should create wiki/ and raw/ directories", async () => {
    await ensureDirectories();
    const wikiStat = await fs.stat(path.join(tmpDir, "wiki"));
    const rawStat = await fs.stat(path.join(tmpDir, "raw"));
    expect(wikiStat.isDirectory()).toBe(true);
    expect(rawStat.isDirectory()).toBe(true);
  });
});

describe("writeWikiPage + readWikiPage roundtrip", () => {
  it("should write and read back a wiki page", async () => {
    const content = "# Test Page\n\nHello world.";
    await writeWikiPage("test-page", content);

    const page = await readWikiPage("test-page");
    expect(page).not.toBeNull();
    expect(page!.slug).toBe("test-page");
    expect(page!.title).toBe("Test Page");
    expect(page!.content).toBe(content);
    expect(page!.path).toBe(
      path.join(tmpDir, "wiki", "test-page.md"),
    );
  });

  it("should use slug as title when no heading present", async () => {
    await writeWikiPage("no-heading", "Just some text without a heading.");
    const page = await readWikiPage("no-heading");
    expect(page).not.toBeNull();
    expect(page!.title).toBe("no-heading");
  });
});

describe("readWikiPage", () => {
  it("should return null for a non-existent page", async () => {
    await ensureDirectories();
    const page = await readWikiPage("does-not-exist");
    expect(page).toBeNull();
  });
});

describe("updateIndex + listWikiPages roundtrip", () => {
  it("should write an index and read it back", async () => {
    const entries: IndexEntry[] = [
      { slug: "alpha", title: "Alpha Page", summary: "First entry" },
      { slug: "beta", title: "Beta Page", summary: "Second entry" },
    ];

    await updateIndex(entries);
    const result = await listWikiPages();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(entries[0]);
    expect(result[1]).toEqual(entries[1]);
  });

  it("should return empty array when index does not exist", async () => {
    await ensureDirectories();
    const result = await listWikiPages();
    expect(result).toEqual([]);
  });

  it("enriches entries with frontmatter metadata (tags, updated, source_count)", async () => {
    // Write three wiki pages with varying frontmatter shapes.
    await writeWikiPage(
      "alpha",
      "---\nupdated: 2026-04-08\nsource_count: 3\ntags: [ai, llm]\n---\n\n# Alpha\n\nBody.\n",
    );
    await writeWikiPage(
      "beta",
      "---\nupdated: 2026-04-07\nsource_count: 1\ntags: [llm]\n---\n\n# Beta\n\nBody.\n",
    );
    // No frontmatter — should fall back gracefully.
    await writeWikiPage("gamma", "# Gamma\n\nPlain body, no frontmatter.\n");

    await updateIndex([
      { slug: "alpha", title: "Alpha", summary: "First" },
      { slug: "beta", title: "Beta", summary: "Second" },
      { slug: "gamma", title: "Gamma", summary: "Third" },
    ]);

    const result = await listWikiPages();
    expect(result).toHaveLength(3);

    const alpha = result.find((e) => e.slug === "alpha")!;
    expect(alpha.tags).toEqual(["ai", "llm"]);
    expect(alpha.updated).toBe("2026-04-08");
    expect(alpha.sourceCount).toBe(3);

    const beta = result.find((e) => e.slug === "beta")!;
    expect(beta.tags).toEqual(["llm"]);
    expect(beta.updated).toBe("2026-04-07");
    expect(beta.sourceCount).toBe(1);

    // The plain page still returns a valid entry; new fields are undefined.
    const gamma = result.find((e) => e.slug === "gamma")!;
    expect(gamma.title).toBe("Gamma");
    expect(gamma.summary).toBe("Third");
    expect(gamma.tags).toBeUndefined();
    expect(gamma.updated).toBeUndefined();
    expect(gamma.sourceCount).toBeUndefined();
  });

  it("falls back to the plain entry when a page is missing on disk", async () => {
    // Index references a slug that has no corresponding file.
    await updateIndex([
      { slug: "ghost", title: "Ghost", summary: "Not on disk" },
    ]);

    const result = await listWikiPages();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      slug: "ghost",
      title: "Ghost",
      summary: "Not on disk",
    });
  });
});

describe("saveRawSource", () => {
  it("should write file and return its path", async () => {
    const content = "Raw document content here.";
    const filePath = await saveRawSource("doc-001", content);

    expect(filePath).toBe(path.join(tmpDir, "raw", "doc-001.md"));
    const stored = await fs.readFile(filePath, "utf-8");
    expect(stored).toBe(content);
  });
});

describe("appendToLog", () => {
  it("should append H2-headed entries to log.md matching the founding spec", async () => {
    await appendToLog("ingest", "first entry");
    await appendToLog("ingest", "second entry");

    const logPath = path.join(tmpDir, "wiki", "log.md");
    const content = await fs.readFile(logPath, "utf-8");

    // Should contain two H2 heading lines matching: ## [YYYY-MM-DD] op | title
    const headingRe = /^## \[\d{4}-\d{2}-\d{2}\] ingest \| (first|second) entry$/gm;
    const headings = content.match(headingRe) ?? [];
    expect(headings).toHaveLength(2);
    expect(headings[0]).toMatch(/first entry$/);
    expect(headings[1]).toMatch(/second entry$/);
  });

  it("grep-style match returns one line per appended entry", async () => {
    await appendToLog("ingest", "alpha");
    await appendToLog("query", "beta");
    await appendToLog("lint", "gamma");

    const content = await fs.readFile(
      path.join(tmpDir, "wiki", "log.md"),
      "utf-8",
    );
    // Equivalent to: grep "^## \[" log.md
    const lines = content
      .split("\n")
      .filter((l) => /^## \[/.test(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("ingest | alpha");
    expect(lines[1]).toContain("query | beta");
    expect(lines[2]).toContain("lint | gamma");
  });

  it("writes a body details line when details are provided", async () => {
    await appendToLog("ingest", "Some Title", "slug: some-title · 2 related");
    const content = await fs.readFile(
      path.join(tmpDir, "wiki", "log.md"),
      "utf-8",
    );
    expect(content).toMatch(
      /^## \[\d{4}-\d{2}-\d{2}\] ingest \| Some Title$/m,
    );
    expect(content).toContain("slug: some-title · 2 related");
  });

  it("omits the body line when no details are provided", async () => {
    await appendToLog("query", "Headless Entry");
    const content = await fs.readFile(
      path.join(tmpDir, "wiki", "log.md"),
      "utf-8",
    );
    // Two newlines after the heading, then nothing else (or just whitespace).
    expect(content).toBe("## [" + new Date().toISOString().slice(0, 10) + "] query | Headless Entry\n\n");
  });

  it("throws on invalid operation", async () => {
    await expect(
      // @ts-expect-error — testing runtime validation
      appendToLog("bogus", "title"),
    ).rejects.toThrow(/Invalid log operation/);
  });

  it("throws on empty title", async () => {
    await expect(appendToLog("ingest", "")).rejects.toThrow(/non-empty/);
    await expect(appendToLog("ingest", "   ")).rejects.toThrow(/non-empty/);
  });

  it("accepts the 'delete' op kind", async () => {
    await appendToLog("delete", "Removed Page", "deleted · stripped backlinks from 0 page(s)");
    const content = await fs.readFile(
      path.join(tmpDir, "wiki", "log.md"),
      "utf-8",
    );
    expect(content).toMatch(
      /^## \[\d{4}-\d{2}-\d{2}\] delete \| Removed Page$/m,
    );
    expect(content).toContain(" delete | ");
  });
});

// ---------------------------------------------------------------------------
// readLog
// ---------------------------------------------------------------------------

describe("readLog", () => {
  it("should return null when log.md does not exist", async () => {
    await ensureDirectories();
    const result = await readLog();
    expect(result).toBeNull();
  });

  it("should return log content after entries are appended", async () => {
    await appendToLog("ingest", "test entry");
    const result = await readLog();
    expect(result).not.toBeNull();
    expect(result).toMatch(/test entry/);
  });
});

// ---------------------------------------------------------------------------
// validateSlug
// ---------------------------------------------------------------------------

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    expect(() => validateSlug("machine-learning")).not.toThrow();
    expect(() => validateSlug("ai-2024")).not.toThrow();
    expect(() => validateSlug("a")).not.toThrow();
    expect(() => validateSlug("2024")).not.toThrow();
    expect(() => validateSlug("x1")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateSlug("")).toThrow(/non-empty/);
  });

  it("rejects whitespace-only string", () => {
    expect(() => validateSlug("   ")).toThrow(/non-empty/);
  });

  it("rejects path traversal with ../", () => {
    expect(() => validateSlug("../")).toThrow(/path/);
  });

  it("rejects ../../etc/passwd", () => {
    expect(() => validateSlug("../../etc/passwd")).toThrow();
  });

  it("rejects slugs with forward slash", () => {
    expect(() => validateSlug("foo/bar")).toThrow(/path separators/);
  });

  it("rejects slugs with backslash", () => {
    expect(() => validateSlug("foo\\bar")).toThrow(/path separators/);
  });

  it("rejects strings with null bytes", () => {
    expect(() => validateSlug("foo\0bar")).toThrow(/null bytes/);
  });

  it("rejects uppercase characters", () => {
    expect(() => validateSlug("Hello")).toThrow(/safe pattern/);
  });

  it("rejects slugs starting with hyphen", () => {
    expect(() => validateSlug("-foo")).toThrow(/safe pattern/);
  });

  it("rejects slugs ending with hyphen", () => {
    expect(() => validateSlug("foo-")).toThrow(/safe pattern/);
  });

  it("rejects slugs with special characters", () => {
    expect(() => validateSlug("foo@bar")).toThrow(/safe pattern/);
  });
});

// ---------------------------------------------------------------------------
// Path traversal protection in read/write/save
// ---------------------------------------------------------------------------

describe("readWikiPage — path traversal protection", () => {
  it("returns null for path-traversal slug", async () => {
    await ensureDirectories();
    const result = await readWikiPage("../../etc/passwd");
    expect(result).toBeNull();
  });

  it("returns null for empty slug", async () => {
    await ensureDirectories();
    const result = await readWikiPage("");
    expect(result).toBeNull();
  });

  it("returns null for slug with slashes", async () => {
    await ensureDirectories();
    const result = await readWikiPage("foo/bar");
    expect(result).toBeNull();
  });
});

describe("writeWikiPage — path traversal protection", () => {
  it("throws for path-traversal slug", async () => {
    await expect(
      writeWikiPage("../../etc/passwd", "malicious content"),
    ).rejects.toThrow();
  });

  it("throws for empty slug", async () => {
    await expect(writeWikiPage("", "content")).rejects.toThrow(/non-empty/);
  });

  it("throws for slug with slashes", async () => {
    await expect(
      writeWikiPage("foo/bar", "content"),
    ).rejects.toThrow(/path separators/);
  });
});

describe("saveRawSource — path traversal protection", () => {
  it("throws for path-traversal id", async () => {
    await expect(
      saveRawSource("../../etc/passwd", "malicious content"),
    ).rejects.toThrow();
  });

  it("throws for empty id", async () => {
    await expect(saveRawSource("", "content")).rejects.toThrow(/non-empty/);
  });
});

// ---------------------------------------------------------------------------
// writeWikiPageWithSideEffects — the unified write pipeline both ingest()
// and saveAnswerToWiki() now go through. These tests pin the contract so
// future write-paths (edit, delete, re-ingest, import) can rely on it.
// ---------------------------------------------------------------------------
describe("writeWikiPageWithSideEffects", () => {
  it("writes the page file with the supplied content", async () => {
    const result = await writeWikiPageWithSideEffects({
      slug: "alpha",
      title: "Alpha",
      content: "# Alpha\n\nThe first letter.",
      summary: "First letter of the alphabet.",
      logOp: "ingest",
      crossRefSource: null,
    });

    expect(result.slug).toBe("alpha");
    const page = await readWikiPage("alpha");
    expect(page).not.toBeNull();
    expect(page!.content).toBe("# Alpha\n\nThe first letter.");
  });

  it("inserts a new index entry when the slug is unknown", async () => {
    await writeWikiPageWithSideEffects({
      slug: "beta",
      title: "Beta",
      content: "# Beta\n\nSecond.",
      summary: "Second letter.",
      logOp: "ingest",
      crossRefSource: null,
    });

    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      slug: "beta",
      title: "Beta",
      summary: "Second letter.",
    });
  });

  it("updates the existing index entry on re-write (no duplicates)", async () => {
    // First write — initial title + summary.
    await writeWikiPageWithSideEffects({
      slug: "gamma",
      title: "Gamma",
      content: "# Gamma\n\nv1",
      summary: "first version",
      logOp: "ingest",
      crossRefSource: null,
    });

    // Second write under the same slug — must overwrite, not duplicate.
    await writeWikiPageWithSideEffects({
      slug: "gamma",
      title: "Gamma (updated)",
      content: "# Gamma (updated)\n\nv2",
      summary: "second version",
      logOp: "save",
      crossRefSource: null,
    });

    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      slug: "gamma",
      title: "Gamma (updated)",
      summary: "second version",
    });

    // Page file content reflects the second write.
    const page = await readWikiPage("gamma");
    expect(page!.content).toBe("# Gamma (updated)\n\nv2");
  });

  it("appends a structured log line with the supplied op + details", async () => {
    await writeWikiPageWithSideEffects({
      slug: "delta",
      title: "Delta Page",
      content: "# Delta Page\n\n…",
      summary: "fourth letter",
      logOp: "save",
      crossRefSource: null,
      logDetails: ({ updatedSlugs }) =>
        `slug: delta · linked ${updatedSlugs.length} related page(s)`,
    });

    const log = await readLog();
    expect(log).not.toBeNull();
    // H2 heading, save op, our title.
    expect(log).toMatch(
      /^## \[\d{4}-\d{2}-\d{2}\] save \| Delta Page$/m,
    );
    // Details body line — `updatedSlugs` is empty because cross-ref was
    // skipped (no LLM key in the test environment, and we passed null).
    expect(log).toContain("slug: delta · linked 0 related page(s)");
  });

  it("skips cross-reference entirely when crossRefSource is null", async () => {
    // Pre-existing page that would normally be a cross-ref candidate.
    await writeWikiPage(
      "machine-learning",
      "# Machine Learning\n\nA field of AI.",
    );
    await updateIndex([
      {
        slug: "machine-learning",
        title: "Machine Learning",
        summary: "A field of AI.",
      },
    ]);

    const result = await writeWikiPageWithSideEffects({
      slug: "neural-networks",
      title: "Neural Networks",
      content:
        "# Neural Networks\n\nLayered models used in machine learning.",
      summary: "Layered models used in ML.",
      logOp: "ingest",
      crossRefSource: null, // explicit skip
    });

    // No related pages updated — cross-ref was skipped.
    expect(result.updatedSlugs).toEqual([]);

    // The pre-existing page is unchanged: no "See also" section was added.
    const ml = await readWikiPage("machine-learning");
    expect(ml!.content).toBe("# Machine Learning\n\nA field of AI.");
    expect(ml!.content).not.toContain("See also");
  });

  it("returns the slug it wrote", async () => {
    const result = await writeWikiPageWithSideEffects({
      slug: "epsilon",
      title: "Epsilon",
      content: "# Epsilon",
      summary: "fifth",
      logOp: "ingest",
      crossRefSource: null,
    });
    expect(result.slug).toBe("epsilon");
  });

  it("propagates slug validation errors before touching the filesystem", async () => {
    await expect(
      writeWikiPageWithSideEffects({
        slug: "../../etc/passwd",
        title: "Bad",
        content: "# Bad",
        summary: "bad",
        logOp: "ingest",
        crossRefSource: null,
      }),
    ).rejects.toThrow(/Invalid slug/);
    // No log file should have been created.
    const log = await readLog();
    expect(log).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteWikiPage — hard delete + index cleanup + backlink stripping.
// ---------------------------------------------------------------------------
describe("deleteWikiPage", () => {
  it("deletes the page file from the wiki directory", async () => {
    await writeWikiPage("doomed", "# Doomed\n\nThis page is going away.");
    await updateIndex([
      { slug: "doomed", title: "Doomed", summary: "ephemeral" },
    ]);

    await deleteWikiPage("doomed");

    const page = await readWikiPage("doomed");
    expect(page).toBeNull();
    await expect(
      fs.stat(path.join(tmpDir, "wiki", "doomed.md")),
    ).rejects.toThrow();
  });

  it("removes the entry from the index", async () => {
    await writeWikiPage("keep", "# Keep\n\nStays.");
    await writeWikiPage("drop", "# Drop\n\nGoes.");
    await updateIndex([
      { slug: "keep", title: "Keep", summary: "stays" },
      { slug: "drop", title: "Drop", summary: "goes" },
    ]);

    const result = await deleteWikiPage("drop");

    expect(result.removedFromIndex).toBe(true);
    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0].slug).toBe("keep");
  });

  it("throws on an unknown slug", async () => {
    await ensureDirectories();
    await expect(deleteWikiPage("nope")).rejects.toThrow(/page not found/);
  });

  it("throws on an invalid slug (path traversal)", async () => {
    await ensureDirectories();
    await expect(deleteWikiPage("../evil")).rejects.toThrow(/Invalid slug/);
  });

  it("strips a plain markdown backlink from a linking page", async () => {
    await writeWikiPage(
      "target",
      "# Target\n\nThe page being deleted.",
    );
    await writeWikiPage(
      "linker",
      "# Linker\n\nThis page references [Target](target.md) inline.",
    );
    await updateIndex([
      { slug: "target", title: "Target", summary: "doomed" },
      { slug: "linker", title: "Linker", summary: "refers" },
    ]);

    const result = await deleteWikiPage("target");

    expect(result.strippedBacklinksFrom).toContain("linker");
    const linker = await readWikiPage("linker");
    expect(linker).not.toBeNull();
    expect(linker!.content).not.toContain("target.md");
    expect(linker!.content).not.toContain("[Target]");
  });

  it("strips a **See also:** line cleanly when it only links the deleted page", async () => {
    await writeWikiPage(
      "target",
      "# Target\n\nThe page being deleted.",
    );
    await writeWikiPage(
      "linker",
      "# Linker\n\nBody text.\n\n**See also:** [Target](target.md)\n",
    );
    await updateIndex([
      { slug: "target", title: "Target", summary: "doomed" },
      { slug: "linker", title: "Linker", summary: "refers" },
    ]);

    await deleteWikiPage("target");

    const linker = await readWikiPage("linker");
    expect(linker).not.toBeNull();
    // The See-also line should be gone entirely (not left as an empty stub).
    expect(linker!.content).not.toMatch(/\*\*See also:\*\*\s*$/m);
    expect(linker!.content).not.toContain("target.md");
    expect(linker!.content).not.toContain("[Target]");
    // No runs of 3+ newlines left behind.
    expect(linker!.content).not.toMatch(/\n{3,}/);
  });

  it("cleans leading-comma artefact in a multi-link See also line", async () => {
    await writeWikiPage("target", "# Target\n\nDoomed.");
    await writeWikiPage("other", "# Other\n\nSurvives.");
    await writeWikiPage(
      "linker",
      "# Linker\n\nBody.\n\n**See also:** [Target](target.md), [Other](other.md)\n",
    );
    await updateIndex([
      { slug: "target", title: "Target", summary: "doomed" },
      { slug: "other", title: "Other", summary: "survives" },
      { slug: "linker", title: "Linker", summary: "refers" },
    ]);

    await deleteWikiPage("target");

    const linker = await readWikiPage("linker");
    expect(linker).not.toBeNull();
    // Should still link to other.md, with no leading comma.
    expect(linker!.content).toContain("**See also:** [Other](other.md)");
    expect(linker!.content).not.toContain("target.md");
    expect(linker!.content).not.toMatch(/\*\*See also:\*\*\s*,/);
  });

  it("cleans trailing-comma artefact in a multi-link See also line", async () => {
    await writeWikiPage("target", "# Target\n\nDoomed.");
    await writeWikiPage("other", "# Other\n\nSurvives.");
    await writeWikiPage(
      "linker",
      "# Linker\n\nBody.\n\n**See also:** [Other](other.md), [Target](target.md)\n",
    );
    await updateIndex([
      { slug: "target", title: "Target", summary: "doomed" },
      { slug: "other", title: "Other", summary: "survives" },
      { slug: "linker", title: "Linker", summary: "refers" },
    ]);

    await deleteWikiPage("target");

    const linker = await readWikiPage("linker");
    expect(linker).not.toBeNull();
    expect(linker!.content).toContain("[Other](other.md)");
    expect(linker!.content).not.toContain("target.md");
    // No trailing comma on the See also line.
    expect(linker!.content).not.toMatch(/,\s*\n/);
    expect(linker!.content).not.toMatch(/,\s*$/m);
  });

  it("appends a log entry with op 'delete' and 'deleted' in the details", async () => {
    await writeWikiPage("zeta", "# Zeta Page\n\nDoomed.");
    await updateIndex([
      { slug: "zeta", title: "Zeta Page", summary: "doomed" },
    ]);

    await deleteWikiPage("zeta");

    const log = await readLog();
    expect(log).not.toBeNull();
    expect(log).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] delete \| Zeta Page$/m);
    expect(log).toContain("deleted");
    expect(log).toContain("stripped backlinks from 0 page(s)");
  });

  it("returns an accurate strippedBacklinksFrom list", async () => {
    await writeWikiPage("target", "# Target\n\nDoomed.");
    await writeWikiPage(
      "linker-a",
      "# Linker A\n\nSee [Target](target.md).",
    );
    await writeWikiPage(
      "linker-b",
      "# Linker B\n\nAlso [Target](target.md).",
    );
    await writeWikiPage("unrelated", "# Unrelated\n\nNo links here.");
    await updateIndex([
      { slug: "target", title: "Target", summary: "doomed" },
      { slug: "linker-a", title: "Linker A", summary: "a" },
      { slug: "linker-b", title: "Linker B", summary: "b" },
      { slug: "unrelated", title: "Unrelated", summary: "none" },
    ]);

    const result = await deleteWikiPage("target");

    expect(result.strippedBacklinksFrom.sort()).toEqual([
      "linker-a",
      "linker-b",
    ]);
  });

  // -------------------------------------------------------------------------
  // Consolidated pipeline coverage — delete flows through the same
  // lifecycle-op pipeline as writes (see the "Delete is a write-path too"
  // and "Acting on the shallow fix buries the deep signal" learnings).
  // These cases exercise the shared pipeline end-to-end via deleteWikiPage.
  // -------------------------------------------------------------------------

  it("strips inbound links from two linking pages while preserving their non-link content", async () => {
    await writeWikiPage("target", "# Target\n\nDoomed.");
    await writeWikiPage(
      "linker-a",
      "# Linker A\n\nParagraph one about [Target](target.md) matters.\n\nParagraph two is unrelated and should survive verbatim.",
    );
    await writeWikiPage(
      "linker-b",
      "# Linker B\n\nAlpha intro.\n\n**See also:** [Target](target.md)\n",
    );
    await updateIndex([
      { slug: "target", title: "Target", summary: "doomed" },
      { slug: "linker-a", title: "Linker A", summary: "refs" },
      { slug: "linker-b", title: "Linker B", summary: "also refs" },
    ]);

    const result = await deleteWikiPage("target");

    // Both linkers were rewritten.
    expect(result.strippedBacklinksFrom.sort()).toEqual([
      "linker-a",
      "linker-b",
    ]);

    // Linker A kept all its non-link prose; only the link itself is gone.
    const a = await readWikiPage("linker-a");
    expect(a).not.toBeNull();
    expect(a!.content).toContain("# Linker A");
    expect(a!.content).toContain("Paragraph one about");
    expect(a!.content).toContain("matters.");
    expect(a!.content).toContain(
      "Paragraph two is unrelated and should survive verbatim.",
    );
    expect(a!.content).not.toContain("target.md");
    expect(a!.content).not.toContain("[Target]");

    // Linker B kept its intro; the lone See-also line is cleaned out.
    const b = await readWikiPage("linker-b");
    expect(b).not.toBeNull();
    expect(b!.content).toContain("# Linker B");
    expect(b!.content).toContain("Alpha intro.");
    expect(b!.content).not.toContain("target.md");
    expect(b!.content).not.toMatch(/\*\*See also:\*\*\s*$/m);
  });

  it("removes only the deleted page's index entry, leaving other entries alone", async () => {
    await writeWikiPage("alpha", "# Alpha\n\nFirst.");
    await writeWikiPage("beta", "# Beta\n\nSecond.");
    await writeWikiPage("gamma", "# Gamma\n\nThird.");
    await updateIndex([
      { slug: "alpha", title: "Alpha", summary: "first" },
      { slug: "beta", title: "Beta", summary: "second" },
      { slug: "gamma", title: "Gamma", summary: "third" },
    ]);

    await deleteWikiPage("beta");

    const entries = await listWikiPages();
    expect(entries.map((e) => e.slug).sort()).toEqual(["alpha", "gamma"]);
    // Surviving entries keep their original summary/title — no drive-by edits.
    expect(entries.find((e) => e.slug === "alpha")).toMatchObject({
      title: "Alpha",
      summary: "first",
    });
    expect(entries.find((e) => e.slug === "gamma")).toMatchObject({
      title: "Gamma",
      summary: "third",
    });
  });
});

// ---------------------------------------------------------------------------
// Graph API route — exercises link extraction across multiple pages.
// Regression test for the stale-`lastIndex` footgun on the g-flag regex.
// ---------------------------------------------------------------------------
describe("/api/wiki/graph route", () => {
  it("extracts edges across multiple pages without losing matches", async () => {
    // Three pages, each linking to two others. With a per-loop regex, all
    // 6 directed edges must be present. (A stale-`lastIndex` bug would
    // intermittently drop edges depending on string lengths.)
    await writeWikiPage(
      "alpha",
      "# Alpha\n\nSee [Beta](beta.md) and [Gamma](gamma.md) for context.",
    );
    await writeWikiPage(
      "beta",
      "# Beta\n\nReferences [Alpha](alpha.md) and [Gamma](gamma.md).",
    );
    await writeWikiPage(
      "gamma",
      "# Gamma\n\nMentions [Alpha](alpha.md) and [Beta](beta.md) heavily.",
    );
    await updateIndex([
      { slug: "alpha", title: "Alpha", summary: "First" },
      { slug: "beta", title: "Beta", summary: "Second" },
      { slug: "gamma", title: "Gamma", summary: "Third" },
    ]);

    const { GET } = await import("../../app/api/wiki/graph/route");
    const res = await GET();
    const data = (await res.json()) as {
      nodes: { id: string; label: string }[];
      edges: { source: string; target: string }[];
    };

    expect(data.nodes).toHaveLength(3);
    const slugs = data.nodes.map((n) => n.id).sort();
    expect(slugs).toEqual(["alpha", "beta", "gamma"]);

    // All 6 directed edges should be present
    expect(data.edges).toHaveLength(6);
    const edgeKeys = data.edges
      .map((e) => `${e.source}->${e.target}`)
      .sort();
    expect(edgeKeys).toEqual(
      [
        "alpha->beta",
        "alpha->gamma",
        "beta->alpha",
        "beta->gamma",
        "gamma->alpha",
        "gamma->beta",
      ].sort(),
    );
  });

  it("ignores links to slugs not in the wiki", async () => {
    await writeWikiPage(
      "real",
      "# Real\n\nLinks to [ghost](ghost.md) which doesn't exist.",
    );
    await updateIndex([
      { slug: "real", title: "Real", summary: "Exists" },
    ]);

    const { GET } = await import("../../app/api/wiki/graph/route");
    const res = await GET();
    const data = (await res.json()) as {
      edges: { source: string; target: string }[];
    };

    expect(data.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// YAML frontmatter parser + serializer
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("returns empty data and the full content when no frontmatter is present", () => {
    const content = "# My Page\n\nJust a regular markdown document.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });

  it("parses plain string scalars", () => {
    const content =
      "---\ncreated: 2026-04-08\ntitle: Hello World\n---\n\n# Body\n";
    const result = parseFrontmatter(content);
    expect(result.data.created).toBe("2026-04-08");
    expect(result.data.title).toBe("Hello World");
    expect(result.body).toBe("# Body\n");
  });

  it("parses numeric-looking scalars as strings", () => {
    const content = "---\nsource_count: 3\n---\n\nbody";
    const result = parseFrontmatter(content);
    expect(result.data.source_count).toBe("3");
  });

  it("parses inline arrays with plain and quoted elements", () => {
    const content =
      '---\ntags: [alpha, beta, "gamma delta"]\n---\n\nbody\n';
    const result = parseFrontmatter(content);
    expect(result.data.tags).toEqual(["alpha", "beta", "gamma delta"]);
  });

  it("parses empty inline arrays as empty arrays", () => {
    const content = "---\ntags: []\n---\n\nbody\n";
    const result = parseFrontmatter(content);
    expect(result.data.tags).toEqual([]);
  });

  it("strips surrounding double quotes from scalars", () => {
    const content = '---\ntitle: "Hello: World"\n---\n\nbody';
    const result = parseFrontmatter(content);
    expect(result.data.title).toBe("Hello: World");
  });

  it("strips the frontmatter block from the body", () => {
    const content =
      "---\ncreated: 2026-04-08\ntags: []\n---\n\n# Hello\n\nBody text.\n";
    const result = parseFrontmatter(content);
    expect(result.body).toBe("# Hello\n\nBody text.\n");
    expect(result.body).not.toContain("---");
  });

  it("throws on unclosed frontmatter block", () => {
    const content = "---\ncreated: 2026-04-08\ntitle: stuck\n\n# No close\n";
    expect(() => parseFrontmatter(content)).toThrow(/closing/);
  });

  it("throws on nested objects", () => {
    const content =
      "---\nmeta:\n  nested: value\n---\n\nbody\n";
    expect(() => parseFrontmatter(content)).toThrow(/nested/i);
  });

  it("throws on block arrays", () => {
    const content = "---\ntags:\n  - alpha\n  - beta\n---\n\nbody\n";
    expect(() => parseFrontmatter(content)).toThrow(/nested|block/i);
  });

  it("throws on block scalars", () => {
    const content = "---\nnotes: |\n  multi-line\n  text here\n---\n\nbody";
    expect(() => parseFrontmatter(content)).toThrow(/block|nested/i);
  });

  it("throws when a line is missing a colon", () => {
    const content = "---\nnot a valid line\n---\n\nbody";
    expect(() => parseFrontmatter(content)).toThrow(/colon|:/);
  });

  it("throws on malformed inline array (missing closing bracket)", () => {
    const content = "---\ntags: [a, b, c\n---\n\nbody";
    expect(() => parseFrontmatter(content)).toThrow(/array|close/i);
  });
});

describe("serializeFrontmatter", () => {
  it("returns the body unchanged when data is empty", () => {
    const body = "# Hello\n\nBody text.\n";
    expect(serializeFrontmatter({}, body)).toBe(body);
  });

  it("emits keys in insertion order", () => {
    const out = serializeFrontmatter(
      { created: "2026-04-08", updated: "2026-04-08", source_count: "1" },
      "# Body\n",
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[1]).toBe("created: 2026-04-08");
    expect(lines[2]).toBe("updated: 2026-04-08");
    expect(lines[3]).toBe("source_count: 1");
    expect(lines[4]).toBe("---");
  });

  it("emits arrays inline", () => {
    const out = serializeFrontmatter({ tags: ["a", "b", "c"] }, "body\n");
    expect(out).toContain("tags: [a, b, c]");
  });

  it("quotes array elements that contain commas", () => {
    const out = serializeFrontmatter({ tags: ["a, b", "c"] }, "body\n");
    expect(out).toContain('tags: ["a, b", c]');
  });

  it("quotes scalars that contain a colon", () => {
    const out = serializeFrontmatter({ title: "Hello: World" }, "body\n");
    expect(out).toContain('title: "Hello: World"');
  });

  it("round-trips through parseFrontmatter for common shapes", () => {
    const original = {
      created: "2026-04-08",
      updated: "2026-04-08",
      source_count: "2",
      tags: ["foo", "bar", "baz qux"],
    };
    const body = "# Title\n\nBody paragraph.\n";
    const serialized = serializeFrontmatter(original, body);
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.data).toEqual(original);
    expect(reparsed.body).toBe(body);
  });

  it("round-trips empty arrays", () => {
    const original: Record<string, string | string[]> = {
      created: "2026-04-08",
      tags: [],
    };
    const serialized = serializeFrontmatter(original, "body\n");
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.data).toEqual(original);
  });

  it("empty data round-trips to empty data and preserves body verbatim", () => {
    // `serializeFrontmatter({}, body)` returns the body unchanged (no YAML
    // block at all), and parsing that again yields empty frontmatter. This
    // is the invariant the edit PUT handler relies on so that legacy pages
    // with no YAML don't suddenly sprout an empty YAML block on first edit.
    const body = "# Plain\n\nNo metadata here.\n";
    const serialized = serializeFrontmatter({}, body);
    expect(serialized).toBe(body);
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.data).toEqual({});
    expect(reparsed.body).toBe(body);
  });

  it("preserves extra/unknown keys through a round-trip", () => {
    // The edit flow merges frontmatter objects with `{ ...existing }` before
    // bumping `updated`, so any unknown keys an earlier writer put on the
    // page must survive serialize → parse round-trips untouched.
    const original = {
      created: "2026-04-01",
      updated: "2026-04-08",
      source_count: "3",
      tags: ["alpha", "beta"],
      custom_key: "some value",
    };
    const serialized = serializeFrontmatter(original, "# Body\n");
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.data).toEqual(original);
    expect(reparsed.body).toBe("# Body\n");
  });

  it("simulates the edit merge: bumping `updated` preserves every other key", () => {
    // This mirrors what the PUT /api/wiki/[slug] handler does: read the
    // existing frontmatter, spread it, bump `updated`, re-serialize with
    // the new body. The `created` date, `source_count`, `tags`, and any
    // extras must survive that operation.
    const existing = {
      created: "2026-01-15",
      updated: "2026-02-01",
      source_count: "2",
      tags: ["original", "tag"],
    };
    const originalBody = "# Old Title\n\nOld body.\n";
    const existingSerialized = serializeFrontmatter(existing, originalBody);

    // Parse it back as the route would via readWikiPageWithFrontmatter.
    const parsed = parseFrontmatter(existingSerialized);

    // Merge: spread existing, bump updated.
    const today = "2026-04-08";
    const merged: Record<string, string | string[]> = { ...parsed.data };
    if (typeof merged.created !== "string" || merged.created === "") {
      merged.created = today;
    }
    merged.updated = today;

    const newBody = "# New Title\n\nNew body text.\n";
    const reserialized = serializeFrontmatter(merged, newBody);
    const reparsed = parseFrontmatter(reserialized);

    // `created` is preserved, `updated` is bumped, everything else survives.
    expect(reparsed.data.created).toBe("2026-01-15");
    expect(reparsed.data.updated).toBe("2026-04-08");
    expect(reparsed.data.source_count).toBe("2");
    expect(reparsed.data.tags).toEqual(["original", "tag"]);
    expect(reparsed.body).toBe(newBody);
  });

  it("simulates the edit merge on a legacy page with no frontmatter", () => {
    // Legacy pages (written before frontmatter existed) parse to `{}`. The
    // edit handler must backfill `created` as well as set `updated`, and
    // the resulting document must round-trip cleanly.
    const legacyBody = "# Legacy\n\nNo YAML block at all.\n";
    const parsed = parseFrontmatter(legacyBody);
    expect(parsed.data).toEqual({});

    const today = "2026-04-08";
    const merged: Record<string, string | string[]> = { ...parsed.data };
    if (typeof merged.created !== "string" || merged.created === "") {
      merged.created = today;
    }
    merged.updated = today;

    const newBody = "# Legacy (edited)\n\nNow with an edit.\n";
    const reserialized = serializeFrontmatter(merged, newBody);
    const reparsed = parseFrontmatter(reserialized);

    expect(reparsed.data.created).toBe(today);
    expect(reparsed.data.updated).toBe(today);
    expect(reparsed.body).toBe(newBody);
  });
});

describe("readWikiPageWithFrontmatter", () => {
  it("returns empty frontmatter and the full content as body when none is present", async () => {
    await writeWikiPage("plain", "# Plain\n\nNo frontmatter here.\n");
    const page = await readWikiPageWithFrontmatter("plain");
    expect(page).not.toBeNull();
    expect(page!.frontmatter).toEqual({});
    expect(page!.body).toBe("# Plain\n\nNo frontmatter here.\n");
    expect(page!.content).toBe("# Plain\n\nNo frontmatter here.\n");
    expect(page!.title).toBe("Plain");
  });

  it("exposes parsed frontmatter and strips the YAML from body", async () => {
    const content =
      "---\ncreated: 2026-04-08\nsource_count: 1\ntags: [alpha, beta]\n---\n\n# Titled Page\n\nSome body.\n";
    await writeWikiPage("with-fm", content);

    const page = await readWikiPageWithFrontmatter("with-fm");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.created).toBe("2026-04-08");
    expect(page!.frontmatter.source_count).toBe("1");
    expect(page!.frontmatter.tags).toEqual(["alpha", "beta"]);

    // body excludes the YAML block
    expect(page!.body).toBe("# Titled Page\n\nSome body.\n");
    expect(page!.body).not.toContain("---");

    // content retains the full markdown including the frontmatter
    expect(page!.content).toBe(content);

    // title comes from the H1 in the body
    expect(page!.title).toBe("Titled Page");
  });

  it("returns null for a missing slug", async () => {
    await ensureDirectories();
    const page = await readWikiPageWithFrontmatter("does-not-exist");
    expect(page).toBeNull();
  });
});

describe("listRawSources", () => {
  it("returns [] when the raw dir does not exist yet", async () => {
    // Intentionally DO NOT call ensureDirectories — raw/ must be absent.
    const sources = await listRawSources();
    expect(sources).toEqual([]);
  });

  it("returns [] when the raw dir exists but is empty", async () => {
    await ensureDirectories();
    const sources = await listRawSources();
    expect(sources).toEqual([]);
  });

  it("lists every file, sorted by modified time (newest first)", async () => {
    await ensureDirectories();
    const rawDir = path.join(tmpDir, "raw");

    // Write three files, then explicitly set mtimes so the sort is
    // deterministic regardless of how quickly the writes complete.
    await fs.writeFile(path.join(rawDir, "oldest.md"), "oldest body");
    await fs.writeFile(path.join(rawDir, "middle.txt"), "middle body");
    await fs.writeFile(path.join(rawDir, "newest.html"), "<p>newest</p>");

    const t = (iso: string) => new Date(iso);
    await fs.utimes(
      path.join(rawDir, "oldest.md"),
      t("2026-01-01T00:00:00Z"),
      t("2026-01-01T00:00:00Z"),
    );
    await fs.utimes(
      path.join(rawDir, "middle.txt"),
      t("2026-02-01T00:00:00Z"),
      t("2026-02-01T00:00:00Z"),
    );
    await fs.utimes(
      path.join(rawDir, "newest.html"),
      t("2026-03-01T00:00:00Z"),
      t("2026-03-01T00:00:00Z"),
    );

    const sources = await listRawSources();
    expect(sources.map((s) => s.filename)).toEqual([
      "newest.html",
      "middle.txt",
      "oldest.md",
    ]);

    // Slug strips only the final extension.
    expect(sources[0].slug).toBe("newest");
    expect(sources[1].slug).toBe("middle");
    expect(sources[2].slug).toBe("oldest");

    // Size + modified metadata are populated.
    expect(sources[0].size).toBeGreaterThan(0);
    expect(sources[0].modified).toBe("2026-03-01T00:00:00.000Z");
  });

  it("skips dotfiles and subdirectories", async () => {
    await ensureDirectories();
    const rawDir = path.join(tmpDir, "raw");

    await fs.writeFile(path.join(rawDir, "visible.md"), "hi");
    await fs.writeFile(path.join(rawDir, ".hidden"), "secret");
    await fs.writeFile(path.join(rawDir, ".DS_Store"), "junk");
    await fs.mkdir(path.join(rawDir, "nested"));
    await fs.writeFile(path.join(rawDir, "nested", "inside.md"), "inside");

    const sources = await listRawSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].filename).toBe("visible.md");
  });
});

describe("readRawSource", () => {
  it("returns the content of an existing raw source", async () => {
    await ensureDirectories();
    await fs.writeFile(
      path.join(tmpDir, "raw", "sample.md"),
      "# Sample\n\nHello raw world.\n",
    );

    const source = await readRawSource("sample");
    expect(source.slug).toBe("sample");
    expect(source.filename).toBe("sample.md");
    expect(source.content).toBe("# Sample\n\nHello raw world.\n");
    expect(source.size).toBeGreaterThan(0);
    expect(typeof source.modified).toBe("string");
  });

  it("finds a file even when its extension isn't .md", async () => {
    await ensureDirectories();
    await fs.writeFile(
      path.join(tmpDir, "raw", "plain.txt"),
      "just plain text",
    );

    const source = await readRawSource("plain");
    expect(source.filename).toBe("plain.txt");
    expect(source.content).toBe("just plain text");
  });

  it("throws when the slug does not correspond to any file", async () => {
    await ensureDirectories();
    await expect(readRawSource("nonexistent")).rejects.toThrow(
      /raw source not found/,
    );
  });

  it("rejects path-traversal slugs via the validateSlug guard", async () => {
    await ensureDirectories();
    // Plant a decoy outside raw/ that a traversal attempt would target.
    await fs.writeFile(path.join(tmpDir, "outside.md"), "secret");

    await expect(readRawSource("../outside")).rejects.toThrow(/Invalid slug/);
    await expect(readRawSource("../../etc/passwd")).rejects.toThrow(
      /Invalid slug/,
    );
    await expect(readRawSource("foo/bar")).rejects.toThrow(/Invalid slug/);
    await expect(readRawSource("foo\\bar")).rejects.toThrow(/Invalid slug/);
  });
});
