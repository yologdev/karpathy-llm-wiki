import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { lint } from "../lint";
import { writeWikiPage, updateIndex, ensureDirectories } from "../wiki";
import type { IndexEntry } from "../types";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lint-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
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
  it("should return no issues for a clean wiki", async () => {
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

    expect(result.issues).toHaveLength(0);
    expect(result.summary).toContain("clean");
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

    expect(result.issues).toHaveLength(0);
    expect(result.summary).toContain("clean");
  });
});
