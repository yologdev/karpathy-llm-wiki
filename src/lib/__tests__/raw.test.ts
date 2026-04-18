import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { saveRawSource, listRawSources, readRawSource } from "../raw";
import { ensureDirectories } from "../wiki";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "raw-test-"));
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

// ---------------------------------------------------------------------------
// saveRawSource
// ---------------------------------------------------------------------------

describe("saveRawSource", () => {
  it("writes a file to raw/<id>.md and returns the path", async () => {
    const content = "# My Source\n\nSome raw content.";
    const filePath = await saveRawSource("my-source", content);

    expect(filePath).toBe(path.join(tmpDir, "raw", "my-source.md"));

    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("creates the raw directory if it doesn't exist", async () => {
    // raw/ should not exist yet
    await expect(
      fs.stat(path.join(tmpDir, "raw")),
    ).rejects.toThrow();

    await saveRawSource("first-source", "hello");

    const stat = await fs.stat(path.join(tmpDir, "raw"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("throws on path traversal slug", async () => {
    await expect(
      saveRawSource("../../etc/passwd", "malicious"),
    ).rejects.toThrow(/Invalid slug/);
  });

  it("throws on empty slug", async () => {
    await expect(saveRawSource("", "content")).rejects.toThrow(
      /Invalid slug/,
    );
  });

  it("throws on slug with slashes", async () => {
    await expect(
      saveRawSource("foo/bar", "content"),
    ).rejects.toThrow(/Invalid slug/);
  });

  it("overwrites an existing file with the same id", async () => {
    await saveRawSource("overwrite-me", "v1");
    await saveRawSource("overwrite-me", "v2");

    const filePath = path.join(tmpDir, "raw", "overwrite-me.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("v2");
  });
});

// ---------------------------------------------------------------------------
// listRawSources
// ---------------------------------------------------------------------------

describe("listRawSources", () => {
  it("returns an empty array when raw/ doesn't exist", async () => {
    const result = await listRawSources();
    expect(result).toEqual([]);
  });

  it("lists files with correct slug, filename, size, and modified", async () => {
    await saveRawSource("alpha", "Alpha content");

    const sources = await listRawSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].slug).toBe("alpha");
    expect(sources[0].filename).toBe("alpha.md");
    expect(sources[0].size).toBe(Buffer.byteLength("Alpha content"));
    expect(sources[0].modified).toBeDefined();
    // modified should be a valid ISO 8601 string
    expect(new Date(sources[0].modified).toISOString()).toBe(
      sources[0].modified,
    );
  });

  it("strips extension to produce slug", async () => {
    // saveRawSource always writes .md, so the slug should have .md stripped
    await saveRawSource("my-notes", "notes content");

    const sources = await listRawSources();
    expect(sources[0].slug).toBe("my-notes");
    expect(sources[0].filename).toBe("my-notes.md");
  });

  it("sorts newest first by modified time", async () => {
    await saveRawSource("older", "old content");

    // Introduce a small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50));

    await saveRawSource("newer", "new content");

    const sources = await listRawSources();
    expect(sources).toHaveLength(2);
    expect(sources[0].slug).toBe("newer");
    expect(sources[1].slug).toBe("older");
  });

  it("skips dotfiles", async () => {
    await ensureDirectories();
    const rawDir = path.join(tmpDir, "raw");

    // Write a dotfile directly (saveRawSource would reject the slug)
    await fs.writeFile(path.join(rawDir, ".hidden"), "secret");
    await saveRawSource("visible", "content");

    const sources = await listRawSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].slug).toBe("visible");
  });

  it("skips subdirectories", async () => {
    await ensureDirectories();
    const rawDir = path.join(tmpDir, "raw");

    // Create a subdirectory inside raw/
    await fs.mkdir(path.join(rawDir, "subdir"));
    await saveRawSource("file-source", "content");

    const sources = await listRawSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].slug).toBe("file-source");
  });

  it("handles multiple files correctly", async () => {
    await saveRawSource("aaa", "content a");
    await saveRawSource("bbb", "content b");
    await saveRawSource("ccc", "content c");

    const sources = await listRawSources();
    expect(sources).toHaveLength(3);
    // All slugs should be present
    const slugs = sources.map((s) => s.slug);
    expect(slugs).toContain("aaa");
    expect(slugs).toContain("bbb");
    expect(slugs).toContain("ccc");
  });
});

// ---------------------------------------------------------------------------
// readRawSource
// ---------------------------------------------------------------------------

describe("readRawSource", () => {
  it("reads content and metadata for a valid slug", async () => {
    const content = "# Hello\n\nWorld.";
    await saveRawSource("read-me", content);

    const source = await readRawSource("read-me");
    expect(source.slug).toBe("read-me");
    expect(source.filename).toBe("read-me.md");
    expect(source.content).toBe(content);
    expect(source.size).toBe(Buffer.byteLength(content));
    expect(source.modified).toBeDefined();
  });

  it("throws on invalid slug (path traversal)", async () => {
    await expect(
      readRawSource("../../etc/passwd"),
    ).rejects.toThrow(/Invalid slug/);
  });

  it("throws on empty slug", async () => {
    await expect(readRawSource("")).rejects.toThrow(/Invalid slug/);
  });

  it("throws when slug doesn't match any file", async () => {
    await ensureDirectories();

    await expect(readRawSource("nonexistent")).rejects.toThrow(
      /raw source not found/,
    );
  });

  it("returns correct content after overwrite", async () => {
    await saveRawSource("mutable", "version 1");
    await saveRawSource("mutable", "version 2");

    const source = await readRawSource("mutable");
    expect(source.content).toBe("version 2");
  });
});
