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
  ensureDirectories,
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
  it("should append timestamped entries to log.md", async () => {
    await appendToLog("first entry");
    await appendToLog("second entry");

    const logPath = path.join(tmpDir, "wiki", "log.md");
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[.+\] first entry$/);
    expect(lines[1]).toMatch(/^\[.+\] second entry$/);
  });
});
