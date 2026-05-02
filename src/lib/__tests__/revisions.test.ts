import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  saveRevision,
  listRevisions,
  readRevision,
  deleteRevisions,
  getRevisionsDir,
} from "../revisions";
import { writeWikiPage, ensureDirectories } from "../wiki";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "revisions-test-"));
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

describe("saveRevision", () => {
  it("creates a timestamped file in the correct directory", async () => {
    await ensureDirectories();
    const content = "# Test\n\nOriginal content.";
    await saveRevision("test-page", content);

    const dir = getRevisionsDir("test-page");
    const files = await fs.readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d+\.md$/);

    // Verify the content was saved correctly.
    const saved = await fs.readFile(path.join(dir, files[0]), "utf-8");
    expect(saved).toBe(content);
  });
});

describe("listRevisions", () => {
  it("returns revisions newest-first", async () => {
    await ensureDirectories();
    const dir = getRevisionsDir("multi");
    await fs.mkdir(dir, { recursive: true });

    // Write revisions with known timestamps (older first).
    await fs.writeFile(path.join(dir, "1000000000000.md"), "v1", "utf-8");
    await fs.writeFile(path.join(dir, "2000000000000.md"), "v2", "utf-8");
    await fs.writeFile(path.join(dir, "3000000000000.md"), "v3", "utf-8");

    const revisions = await listRevisions("multi");
    expect(revisions).toHaveLength(3);
    // Newest first.
    expect(revisions[0].timestamp).toBe(3000000000000);
    expect(revisions[1].timestamp).toBe(2000000000000);
    expect(revisions[2].timestamp).toBe(1000000000000);

    // Check metadata shape.
    expect(revisions[0].slug).toBe("multi");
    expect(revisions[0].date).toBe(new Date(3000000000000).toISOString());
    expect(revisions[0].sizeBytes).toBe(Buffer.byteLength("v3", "utf-8"));
  });

  it("returns empty array for pages with no revisions", async () => {
    await ensureDirectories();
    const revisions = await listRevisions("no-history");
    expect(revisions).toEqual([]);
  });
});

describe("readRevision", () => {
  it("returns content for a valid timestamp", async () => {
    await ensureDirectories();
    const dir = getRevisionsDir("readable");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "1713150000000.md"), "hello revision", "utf-8");

    const content = await readRevision("readable", 1713150000000);
    expect(content).toBe("hello revision");
  });

  it("returns null for nonexistent timestamp", async () => {
    await ensureDirectories();
    const content = await readRevision("readable", 9999999999999);
    expect(content).toBeNull();
  });
});

describe("deleteRevisions", () => {
  it("removes the revision directory", async () => {
    await ensureDirectories();
    const dir = getRevisionsDir("deletable");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "1000000000000.md"), "v1", "utf-8");

    // Verify it exists first.
    const before = await fs.readdir(dir);
    expect(before).toHaveLength(1);

    await deleteRevisions("deletable");

    // The directory should be gone.
    await expect(fs.access(dir)).rejects.toThrow();
  });

  it("does not throw when revisions directory does not exist", async () => {
    await ensureDirectories();
    // Should complete without error.
    await expect(deleteRevisions("nonexistent")).resolves.toBeUndefined();
  });
});

describe("writeWikiPage integration", () => {
  it("writing over an existing page creates a revision", async () => {
    await ensureDirectories();
    const originalContent = "# Page\n\nVersion 1.";
    await writeWikiPage("integrated", originalContent);

    // Now overwrite — this should snapshot v1.
    const updatedContent = "# Page\n\nVersion 2.";
    await writeWikiPage("integrated", updatedContent);

    const revisions = await listRevisions("integrated");
    expect(revisions).toHaveLength(1);

    // The revision should contain the original content (v1).
    const revContent = await readRevision("integrated", revisions[0].timestamp);
    expect(revContent).toBe(originalContent);

    // The current file should be v2.
    const current = await fs.readFile(
      path.join(process.env.WIKI_DIR!, "integrated.md"),
      "utf-8",
    );
    expect(current).toBe(updatedContent);
  });

  it("writing a new page does NOT create a revision", async () => {
    await ensureDirectories();
    await writeWikiPage("brand-new", "# Brand New\n\nFirst version.");

    const revisions = await listRevisions("brand-new");
    expect(revisions).toEqual([]);
  });

  it("multiple writes create multiple revisions", async () => {
    await ensureDirectories();
    await writeWikiPage("multi-edit", "# V1\n\nFirst.");
    await writeWikiPage("multi-edit", "# V2\n\nSecond.");
    await writeWikiPage("multi-edit", "# V3\n\nThird.");

    const revisions = await listRevisions("multi-edit");
    // Two overwrites → two revisions (v1 and v2 are snapshots).
    expect(revisions).toHaveLength(2);

    // Newest revision should be v2 (the one just before v3 was written).
    const newest = await readRevision("multi-edit", revisions[0].timestamp);
    expect(newest).toBe("# V2\n\nSecond.");

    // Oldest revision should be v1.
    const oldest = await readRevision("multi-edit", revisions[1].timestamp);
    expect(oldest).toBe("# V1\n\nFirst.");
  });
});

describe("author attribution", () => {
  it("saveRevision with author creates .meta.json sidecar", async () => {
    await ensureDirectories();
    const content = "# Authored\n\nSome content.";
    await saveRevision("authored-page", content, "yoyo");

    const dir = getRevisionsDir("authored-page");
    const files = await fs.readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

    expect(mdFiles).toHaveLength(1);
    expect(metaFiles).toHaveLength(1);

    // The meta filename should match the md filename stem.
    const stem = mdFiles[0].slice(0, -3);
    expect(metaFiles[0]).toBe(`${stem}.meta.json`);

    // The sidecar should contain the author.
    const meta = JSON.parse(
      await fs.readFile(path.join(dir, metaFiles[0]), "utf-8"),
    );
    expect(meta).toEqual({ author: "yoyo" });
  });

  it("listRevisions returns author when sidecar exists", async () => {
    await ensureDirectories();
    await saveRevision("with-author", "# Page\n\nContent.", "alice");

    const revisions = await listRevisions("with-author");
    expect(revisions).toHaveLength(1);
    expect(revisions[0].author).toBe("alice");
  });

  it("listRevisions returns undefined author when no sidecar (backward compat)", async () => {
    await ensureDirectories();
    // Save without author — no sidecar created.
    await saveRevision("no-author", "# Page\n\nContent.");

    const revisions = await listRevisions("no-author");
    expect(revisions).toHaveLength(1);
    expect(revisions[0].author).toBeUndefined();
  });

  it("saveRevision without author does not create sidecar", async () => {
    await ensureDirectories();
    await saveRevision("no-meta", "# Page\n\nContent.");

    const dir = getRevisionsDir("no-meta");
    const files = await fs.readdir(dir);
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
    expect(metaFiles).toHaveLength(0);
  });
});
