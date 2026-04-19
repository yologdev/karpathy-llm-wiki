import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  writeWikiPageWithSideEffects,
  deleteWikiPage,
} from "../lifecycle";
import type { WritePageOptions } from "../lifecycle";
import {
  ensureDirectories,
  readWikiPage,
  writeWikiPage,
  listWikiPages,
  readLog,
} from "../wiki";
import { updateIndex } from "../wiki";
import { listRevisions, saveRevision } from "../revisions";

// ---------------------------------------------------------------------------
// Temp directory setup — mirrors wiki.test.ts approach
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-test-"));
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
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal WritePageOptions with sensible defaults. */
function makeOpts(overrides: Partial<WritePageOptions> = {}): WritePageOptions {
  return {
    slug: "test-page",
    title: "Test Page",
    content: "# Test Page\n\nSome content.\n",
    summary: "A test page",
    logOp: "ingest",
    ...overrides,
  };
}

/** Read the raw index.md text from disk. */
async function readIndex(): Promise<string> {
  const indexPath = path.join(process.env.WIKI_DIR!, "index.md");
  return fs.readFile(indexPath, "utf-8");
}

// ===========================================================================
// writeWikiPageWithSideEffects
// ===========================================================================

describe("writeWikiPageWithSideEffects", () => {
  // 1. Creates page file
  it("creates the wiki page file with correct content", async () => {
    const opts = makeOpts();
    await writeWikiPageWithSideEffects(opts);

    const page = await readWikiPage("test-page");
    expect(page).not.toBeNull();
    expect(page!.content).toBe(opts.content);
    expect(page!.slug).toBe("test-page");
  });

  // 2. Creates index entry
  it("creates an index entry with slug, title, and summary", async () => {
    await writeWikiPageWithSideEffects(makeOpts());

    const index = await readIndex();
    expect(index).toContain("test-page.md");
    expect(index).toContain("Test Page");
    expect(index).toContain("A test page");
  });

  // 3. Updates existing index entry (no duplicates)
  it("updates existing index entry without creating duplicates", async () => {
    await writeWikiPageWithSideEffects(makeOpts());
    await writeWikiPageWithSideEffects(
      makeOpts({ summary: "Updated summary" }),
    );

    const index = await readIndex();
    // Should only have one line with "test-page"
    const matches = index.match(/test-page\.md/g);
    expect(matches).toHaveLength(1);
    // Should have the updated summary
    expect(index).toContain("Updated summary");
    expect(index).not.toContain("A test page");
  });

  // 4. Appends to log
  it("appends an entry to log.md with correct operation", async () => {
    await writeWikiPageWithSideEffects(
      makeOpts({ logOp: "ingest" }),
    );

    const log = await readLog();
    expect(log).not.toBeNull();
    expect(log).toContain("ingest");
    expect(log).toContain("Test Page");
  });

  it("appends log with different operations", async () => {
    await writeWikiPageWithSideEffects(
      makeOpts({ slug: "page-a", title: "Page A", logOp: "edit" }),
    );

    const log = await readLog();
    expect(log).toContain("edit");
    expect(log).toContain("Page A");
  });

  // 5. Cross-referencing — when crossRefSource mentions an existing page
  // (Note: cross-referencing depends on LLM via findRelatedPages, which
  //  returns [] when no LLM key is set. We test updateRelatedPages directly
  //  by pre-creating pages and relying on the null-skip path.)
  it("skips cross-referencing when crossRefSource is null", async () => {
    // Create an existing page
    await writeWikiPage("existing", "# Existing\n\nContent.\n");
    await updateIndex([
      { title: "Existing", slug: "existing", summary: "An existing page" },
    ]);

    await writeWikiPageWithSideEffects(
      makeOpts({ crossRefSource: null }),
    );

    // The existing page should NOT have been modified with a See also
    const existingPage = await readWikiPage("existing");
    expect(existingPage).not.toBeNull();
    expect(existingPage!.content).not.toContain("See also");
  });

  // 6. Skip cross-ref when null — updatedSlugs should be empty
  it("returns empty updatedSlugs when crossRefSource is null", async () => {
    const result = await writeWikiPageWithSideEffects(
      makeOpts({ crossRefSource: null }),
    );
    expect(result.updatedSlugs).toEqual([]);
  });

  // 7. Custom logDetails
  it("uses logDetails callback and includes its return value in the log", async () => {
    await writeWikiPageWithSideEffects(
      makeOpts({
        crossRefSource: null,
        logDetails: ({ updatedSlugs }) =>
          `custom-detail: updated ${updatedSlugs.length} pages`,
      }),
    );

    const log = await readLog();
    expect(log).not.toBeNull();
    expect(log).toContain("custom-detail: updated 0 pages");
  });

  it("logDetails receives updatedSlugs from cross-ref phase", async () => {
    let receivedSlugs: string[] | undefined;
    await writeWikiPageWithSideEffects(
      makeOpts({
        crossRefSource: null,
        logDetails: ({ updatedSlugs }) => {
          receivedSlugs = updatedSlugs;
          return "details";
        },
      }),
    );
    expect(receivedSlugs).toBeDefined();
    expect(Array.isArray(receivedSlugs)).toBe(true);
  });

  // 8. Validates slug
  it("rejects empty slug", async () => {
    await expect(
      writeWikiPageWithSideEffects(makeOpts({ slug: "" })),
    ).rejects.toThrow(/invalid slug/i);
  });

  it("rejects path traversal slug", async () => {
    await expect(
      writeWikiPageWithSideEffects(makeOpts({ slug: "../etc" })),
    ).rejects.toThrow(/invalid slug/i);
  });

  it("rejects uppercase slug", async () => {
    await expect(
      writeWikiPageWithSideEffects(makeOpts({ slug: "UpperCase" })),
    ).rejects.toThrow(/invalid slug/i);
  });

  it("rejects slug with path separators", async () => {
    await expect(
      writeWikiPageWithSideEffects(makeOpts({ slug: "a/b" })),
    ).rejects.toThrow(/invalid slug/i);
  });

  // Additional write tests
  it("returns the correct slug", async () => {
    const result = await writeWikiPageWithSideEffects(makeOpts());
    expect(result.slug).toBe("test-page");
  });

  it("handles multiple pages in index correctly", async () => {
    await writeWikiPageWithSideEffects(
      makeOpts({ slug: "alpha", title: "Alpha", summary: "First", crossRefSource: null }),
    );
    await writeWikiPageWithSideEffects(
      makeOpts({ slug: "beta", title: "Beta", summary: "Second", crossRefSource: null }),
    );

    const index = await readIndex();
    expect(index).toContain("alpha.md");
    expect(index).toContain("beta.md");
    expect(index).toContain("Alpha");
    expect(index).toContain("Beta");
  });

  it("preserves existing index entries when adding new pages", async () => {
    await writeWikiPageWithSideEffects(
      makeOpts({ slug: "first", title: "First", summary: "One", crossRefSource: null }),
    );
    await writeWikiPageWithSideEffects(
      makeOpts({ slug: "second", title: "Second", summary: "Two", crossRefSource: null }),
    );

    const entries = await listWikiPages();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.slug)).toContain("first");
    expect(entries.map((e) => e.slug)).toContain("second");
  });

  it("crossRefSource defaults to content when undefined", async () => {
    // Without an LLM key, findRelatedPages returns []. We just verify
    // it doesn't throw and completes successfully (exercising the
    // undefined → use content path).
    const result = await writeWikiPageWithSideEffects(
      makeOpts({ crossRefSource: undefined }),
    );
    expect(result.slug).toBe("test-page");
    expect(result.updatedSlugs).toEqual([]);
  });
});

// ===========================================================================
// deleteWikiPage
// ===========================================================================

describe("deleteWikiPage", () => {
  // 9. Deletes page file
  it("removes the wiki page file from disk", async () => {
    await writeWikiPage("to-delete", "# To Delete\n\nContent.\n");
    await updateIndex([
      { title: "To Delete", slug: "to-delete", summary: "Will be deleted" },
    ]);

    await deleteWikiPage("to-delete");

    const page = await readWikiPage("to-delete");
    expect(page).toBeNull();
  });

  // 10. Removes index entry
  it("removes the slug from index.md", async () => {
    await writeWikiPage("removeme", "# Remove Me\n\nBye.\n");
    await updateIndex([
      { title: "Keep", slug: "keep", summary: "Stays" },
      { title: "Remove Me", slug: "removeme", summary: "Goes away" },
    ]);
    // Also create the "keep" page so it exists
    await writeWikiPage("keep", "# Keep\n\nStaying.\n");

    await deleteWikiPage("removeme");

    const index = await readIndex();
    expect(index).not.toContain("removeme");
    expect(index).toContain("keep");
  });

  // 11. Returns removedFromIndex: true
  it("returns removedFromIndex: true when slug was in index", async () => {
    await writeWikiPage("indexed", "# Indexed\n\nContent.\n");
    await updateIndex([
      { title: "Indexed", slug: "indexed", summary: "In the index" },
    ]);

    const result = await deleteWikiPage("indexed");
    expect(result.removedFromIndex).toBe(true);
  });

  // 12. Returns removedFromIndex: false when slug wasn't in index
  it("returns removedFromIndex: false when slug was not in index", async () => {
    await writeWikiPage("unindexed", "# Unindexed\n\nContent.\n");
    // Don't add to index, but ensure index exists
    await updateIndex([]);

    const result = await deleteWikiPage("unindexed");
    expect(result.removedFromIndex).toBe(false);
  });

  // 13. Strips backlinks from other pages
  it("strips backlinks to the deleted page from other pages", async () => {
    await writeWikiPage("page-a", "# Page A\n\nSee [Target](target.md).\n");
    await writeWikiPage("target", "# Target\n\nI'm the target.\n");
    await updateIndex([
      { title: "Page A", slug: "page-a", summary: "Has a link" },
      { title: "Target", slug: "target", summary: "The target" },
    ]);

    await deleteWikiPage("target");

    const pageA = await readWikiPage("page-a");
    expect(pageA).not.toBeNull();
    expect(pageA!.content).not.toContain("target.md");
    expect(pageA!.content).not.toContain("[Target]");
  });

  // 14. Returns strippedBacklinksFrom list
  it("returns strippedBacklinksFrom with correct slugs", async () => {
    await writeWikiPage(
      "linker",
      "# Linker\n\nPoints to [Victim](victim.md).\n",
    );
    await writeWikiPage("victim", "# Victim\n\nAbout to be deleted.\n");
    await writeWikiPage("bystander", "# Bystander\n\nNo links here.\n");
    await updateIndex([
      { title: "Linker", slug: "linker", summary: "Has link" },
      { title: "Victim", slug: "victim", summary: "Target" },
      { title: "Bystander", slug: "bystander", summary: "Innocent" },
    ]);

    const result = await deleteWikiPage("victim");
    expect(result.strippedBacklinksFrom).toContain("linker");
    expect(result.strippedBacklinksFrom).not.toContain("bystander");
  });

  // 15. Tolerates already-deleted file
  // deleteWikiPage reads the page first (to get the title), so it throws
  // "page not found" if the file is already gone. This is the expected
  // behavior — the ENOENT tolerance in runPageLifecycleOp is a safety net
  // for race conditions (file deleted between readWikiPage and fs.unlink).
  it("throws when the page file does not exist", async () => {
    await updateIndex([]);
    await expect(deleteWikiPage("nonexistent")).rejects.toThrow(
      /page not found/i,
    );
  });

  // 16. Deletes revisions
  it("cleans up revision files for the deleted slug", async () => {
    await writeWikiPage("rev-page", "# Rev Page\n\nVersion 1.\n");
    await updateIndex([
      { title: "Rev Page", slug: "rev-page", summary: "Has revisions" },
    ]);

    // Create some revisions (add small delay to ensure distinct timestamps)
    await saveRevision("rev-page", "# Rev Page\n\nOld version.\n");
    await new Promise((r) => setTimeout(r, 15));
    await saveRevision("rev-page", "# Rev Page\n\nOlder version.\n");

    // Verify revisions exist
    const revsBefore = await listRevisions("rev-page");
    expect(revsBefore.length).toBeGreaterThanOrEqual(1);

    await deleteWikiPage("rev-page");

    // Revisions should be gone
    const revsAfter = await listRevisions("rev-page");
    expect(revsAfter).toHaveLength(0);
  });

  // 17. Validates slug
  it("rejects empty slug on delete", async () => {
    await expect(deleteWikiPage("")).rejects.toThrow(/invalid slug/i);
  });

  it("rejects path traversal slug on delete", async () => {
    await expect(deleteWikiPage("../etc")).rejects.toThrow(/invalid slug/i);
  });

  it("rejects uppercase slug on delete", async () => {
    await expect(deleteWikiPage("BadSlug")).rejects.toThrow(/invalid slug/i);
  });

  // Additional delete tests
  it("appends a delete entry to the log", async () => {
    await writeWikiPage("logged", "# Logged\n\nContent.\n");
    await updateIndex([
      { title: "Logged", slug: "logged", summary: "Will be logged" },
    ]);

    await deleteWikiPage("logged");

    const log = await readLog();
    expect(log).not.toBeNull();
    expect(log).toContain("delete");
    expect(log).toContain("Logged");
  });

  it("log details include stripped backlinks count", async () => {
    await writeWikiPage(
      "ref-page",
      "# Ref Page\n\nLinks to [Gone](gone.md).\n",
    );
    await writeWikiPage("gone", "# Gone\n\nBye.\n");
    await updateIndex([
      { title: "Ref Page", slug: "ref-page", summary: "Has ref" },
      { title: "Gone", slug: "gone", summary: "Going away" },
    ]);

    await deleteWikiPage("gone");

    const log = await readLog();
    expect(log).toContain("stripped backlinks from 1 page(s)");
  });

  it("returns the correct slug in the result", async () => {
    await writeWikiPage("my-page", "# My Page\n\nContent.\n");
    await updateIndex([
      { title: "My Page", slug: "my-page", summary: "My page" },
    ]);

    const result = await deleteWikiPage("my-page");
    expect(result.slug).toBe("my-page");
  });
});

// ===========================================================================
// stripBacklinksTo (tested indirectly via deleteWikiPage)
// ===========================================================================

describe("stripBacklinksTo (via deleteWikiPage)", () => {
  // 18. Strips markdown links
  it("removes [text](slug.md) links from other pages", async () => {
    await writeWikiPage(
      "source",
      "# Source\n\nRead more at [My Target](my-target.md) for details.\n",
    );
    await writeWikiPage("my-target", "# My Target\n\nTarget content.\n");
    await updateIndex([
      { title: "Source", slug: "source", summary: "Has link" },
      { title: "My Target", slug: "my-target", summary: "Target" },
    ]);

    await deleteWikiPage("my-target");

    const source = await readWikiPage("source");
    expect(source).not.toBeNull();
    expect(source!.content).not.toContain("my-target.md");
    expect(source!.content).not.toContain("[My Target]");
  });

  // 19. Cleans empty See also lines
  it("removes empty See also line when the only link is deleted", async () => {
    await writeWikiPage(
      "host",
      "# Host\n\nContent.\n\n**See also:** [Only Link](only-link.md)\n",
    );
    await writeWikiPage("only-link", "# Only Link\n\nTarget.\n");
    await updateIndex([
      { title: "Host", slug: "host", summary: "Has see also" },
      { title: "Only Link", slug: "only-link", summary: "Only" },
    ]);

    await deleteWikiPage("only-link");

    const host = await readWikiPage("host");
    expect(host).not.toBeNull();
    expect(host!.content).not.toContain("See also:");
    expect(host!.content).not.toContain("only-link.md");
  });

  // 20. Fixes orphaned commas
  it("collapses orphaned commas when middle link is removed", async () => {
    await writeWikiPage(
      "hub",
      "# Hub\n\nText.\n\n**See also:** [A](a.md), [B](b.md), [C](c.md)\n",
    );
    await writeWikiPage("a", "# A\n\nContent A.\n");
    await writeWikiPage("b", "# B\n\nContent B.\n");
    await writeWikiPage("c", "# C\n\nContent C.\n");
    await updateIndex([
      { title: "Hub", slug: "hub", summary: "Hub page" },
      { title: "A", slug: "a", summary: "A" },
      { title: "B", slug: "b", summary: "B" },
      { title: "C", slug: "c", summary: "C" },
    ]);

    await deleteWikiPage("b");

    const hub = await readWikiPage("hub");
    expect(hub).not.toBeNull();
    // Should not have double commas
    expect(hub!.content).not.toContain(", ,");
    // Should still link to A and C
    expect(hub!.content).toContain("[A](a.md)");
    expect(hub!.content).toContain("[C](c.md)");
  });

  // 21. Collapses excessive blank lines
  it("collapses 3+ blank lines into 2", async () => {
    // Create a page with a link that, when removed, would leave multiple blank lines
    await writeWikiPage(
      "spacey",
      "# Spacey\n\nParagraph one.\n\n[Gone](gone.md)\n\n\n\nParagraph two.\n",
    );
    await writeWikiPage("gone", "# Gone\n\nContent.\n");
    await updateIndex([
      { title: "Spacey", slug: "spacey", summary: "Has spaces" },
      { title: "Gone", slug: "gone", summary: "Going away" },
    ]);

    await deleteWikiPage("gone");

    const spacey = await readWikiPage("spacey");
    expect(spacey).not.toBeNull();
    // Should not have 3+ consecutive newlines
    expect(spacey!.content).not.toMatch(/\n{3,}/);
  });

  it("cleans up when the first link is removed from See also", async () => {
    await writeWikiPage(
      "ref",
      "# Ref\n\nText.\n\n**See also:** [First](first.md), [Second](second.md)\n",
    );
    await writeWikiPage("first", "# First\n\nContent.\n");
    await writeWikiPage("second", "# Second\n\nContent.\n");
    await updateIndex([
      { title: "Ref", slug: "ref", summary: "Reference" },
      { title: "First", slug: "first", summary: "First" },
      { title: "Second", slug: "second", summary: "Second" },
    ]);

    await deleteWikiPage("first");

    const ref = await readWikiPage("ref");
    expect(ref).not.toBeNull();
    // Should cleanly have just second left, no leading comma
    expect(ref!.content).toContain("**See also:** [Second](second.md)");
    expect(ref!.content).not.toMatch(/\*\*See also:\*\*\s*,/);
  });

  it("handles multiple backlinks across different pages", async () => {
    await writeWikiPage(
      "page-x",
      "# Page X\n\nLinks to [Target](target.md).\n",
    );
    await writeWikiPage(
      "page-y",
      "# Page Y\n\nAlso links to [Target](target.md).\n",
    );
    await writeWikiPage("target", "# Target\n\nTarget content.\n");
    await updateIndex([
      { title: "Page X", slug: "page-x", summary: "X" },
      { title: "Page Y", slug: "page-y", summary: "Y" },
      { title: "Target", slug: "target", summary: "Target" },
    ]);

    const result = await deleteWikiPage("target");

    expect(result.strippedBacklinksFrom).toContain("page-x");
    expect(result.strippedBacklinksFrom).toContain("page-y");
    expect(result.strippedBacklinksFrom).toHaveLength(2);

    // Both pages should no longer link to target
    const px = await readWikiPage("page-x");
    const py = await readWikiPage("page-y");
    expect(px!.content).not.toContain("target.md");
    expect(py!.content).not.toContain("target.md");
  });
});
