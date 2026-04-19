import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { appendToLog, readLog } from "../wiki-log";
import type { LogOperation } from "../wiki-log";
import { ensureDirectories, getWikiDir } from "../wiki";
import { _resetLocks } from "../lock";

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-log-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  _resetLocks();
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
// appendToLog — happy path
// ---------------------------------------------------------------------------

describe("appendToLog", () => {
  it("writes a log entry with correct date format", async () => {
    await appendToLog("ingest", "My Article");
    const content = await readLog();
    expect(content).not.toBeNull();
    // Check heading format: ## [YYYY-MM-DD] operation | title
    expect(content).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] ingest \| My Article\n/);
  });

  it("uses today's date", async () => {
    await appendToLog("query", "Some Query");
    const content = await readLog();
    const today = new Date().toISOString().slice(0, 10);
    expect(content).toContain(`[${today}]`);
  });

  it("writes all allowed operation types", async () => {
    const ops: LogOperation[] = [
      "ingest",
      "query",
      "lint",
      "save",
      "edit",
      "delete",
      "other",
    ];
    for (const op of ops) {
      await appendToLog(op, `Title for ${op}`);
    }
    const content = await readLog();
    for (const op of ops) {
      expect(content).toContain(`${op} | Title for ${op}`);
    }
  });

  it("trims the title", async () => {
    await appendToLog("ingest", "  padded title  ");
    const content = await readLog();
    expect(content).toContain("| padded title\n");
    expect(content).not.toContain("  padded title  ");
  });

  it("appends multiple entries sequentially", async () => {
    await appendToLog("ingest", "First");
    await appendToLog("query", "Second");
    await appendToLog("edit", "Third");
    const content = await readLog();
    const headings = content!.match(/^## \[.*$/gm);
    expect(headings).toHaveLength(3);
    expect(headings![0]).toContain("ingest | First");
    expect(headings![1]).toContain("query | Second");
    expect(headings![2]).toContain("edit | Third");
  });

  // -------------------------------------------------------------------------
  // appendToLog — with details
  // -------------------------------------------------------------------------

  it("includes details body below heading", async () => {
    await appendToLog("ingest", "Article", "Some extra context here");
    const content = await readLog();
    expect(content).toContain("Some extra context here");
    // Details should come after the heading
    const lines = content!.split("\n");
    const headingIdx = lines.findIndex((l) => l.startsWith("## ["));
    expect(headingIdx).toBeGreaterThanOrEqual(0);
    // After the heading there should be a blank line, then details
    expect(lines[headingIdx + 2]).toBe("Some extra context here");
  });

  it("trims details whitespace", async () => {
    await appendToLog("save", "Page", "  extra whitespace  ");
    const content = await readLog();
    expect(content).toContain("extra whitespace");
    expect(content).not.toContain("  extra whitespace  ");
  });

  it("omits details block when details is empty string", async () => {
    await appendToLog("lint", "Check", "");
    const content = await readLog();
    // Block is "heading\n\n" — no details line present
    expect(content).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] lint \| Check\n\n$/);
    // Verify there's no extra content beyond heading + blank line
    const headings = content!.match(/^## \[.*$/gm);
    expect(headings).toHaveLength(1);
  });

  it("omits details block when details is whitespace-only", async () => {
    await appendToLog("lint", "Check", "   ");
    const content = await readLog();
    expect(content).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] lint \| Check\n\n$/);
  });

  it("omits details block when details is undefined", async () => {
    await appendToLog("other", "Thing");
    const content = await readLog();
    expect(content).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] other \| Thing\n\n$/);
  });

  // -------------------------------------------------------------------------
  // appendToLog — validation
  // -------------------------------------------------------------------------

  it("rejects invalid operation string", async () => {
    await expect(
      appendToLog("invalid" as LogOperation, "title"),
    ).rejects.toThrow(/Invalid log operation/);
  });

  it("rejects another invalid operation", async () => {
    await expect(
      appendToLog("create" as LogOperation, "title"),
    ).rejects.toThrow(/Invalid log operation/);
  });

  it("rejects empty title", async () => {
    await expect(appendToLog("ingest", "")).rejects.toThrow(
      /Invalid log title/,
    );
  });

  it("rejects whitespace-only title", async () => {
    await expect(appendToLog("ingest", "   ")).rejects.toThrow(
      /Invalid log title/,
    );
  });

  it("rejects non-string title (number)", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appendToLog("ingest", 42 as any),
    ).rejects.toThrow(/Invalid log title/);
  });

  it("rejects non-string title (null)", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appendToLog("query", null as any),
    ).rejects.toThrow(/Invalid log title/);
  });

  it("rejects non-string title (undefined)", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appendToLog("query", undefined as any),
    ).rejects.toThrow(/Invalid log title/);
  });

  // -------------------------------------------------------------------------
  // appendToLog — concurrency
  // -------------------------------------------------------------------------

  it("handles concurrent appends — all entries appear", async () => {
    const count = 10;
    const promises = Array.from({ length: count }, (_, i) =>
      appendToLog("ingest", `Concurrent-${i}`),
    );
    await Promise.all(promises);
    const content = await readLog();
    const headings = content!.match(/^## \[.*$/gm);
    expect(headings).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(content).toContain(`Concurrent-${i}`);
    }
  });

  it("concurrent appends don't corrupt file", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      appendToLog("save", `Item ${i}`, `Details for item ${i}`),
    );
    await Promise.all(promises);
    const content = await readLog();
    // Each entry has a heading line
    const headings = content!.match(/^## \[.*$/gm);
    expect(headings).toHaveLength(5);
    // Each entry has its details
    for (let i = 0; i < 5; i++) {
      expect(content).toContain(`Details for item ${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// readLog
// ---------------------------------------------------------------------------

describe("readLog", () => {
  it("reads back what was written", async () => {
    await appendToLog("ingest", "Test Article", "Some details");
    const content = await readLog();
    expect(content).toContain("ingest | Test Article");
    expect(content).toContain("Some details");
  });

  it("returns null when log.md doesn't exist", async () => {
    // Fresh directory with no log.md written yet
    const result = await readLog();
    expect(result).toBeNull();
  });

  it("returns null on read errors (non-ENOENT)", async () => {
    // Make the wiki dir unreadable by replacing log.md with a directory
    // (reading a directory as a file triggers EISDIR, not ENOENT)
    const logPath = path.join(getWikiDir(), "log.md");
    await fs.mkdir(logPath, { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await readLog();
    expect(result).toBeNull();
    // Should have logged a warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("readLog"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("returns string content (not buffer)", async () => {
    await appendToLog("edit", "Page");
    const content = await readLog();
    expect(typeof content).toBe("string");
  });

  it("returns full content with multiple entries", async () => {
    await appendToLog("ingest", "A");
    await appendToLog("query", "B");
    const content = await readLog();
    expect(content).toContain("ingest | A");
    expect(content).toContain("query | B");
  });

  it("preserves entry ordering", async () => {
    await appendToLog("ingest", "First");
    await appendToLog("query", "Second");
    const content = await readLog();
    const firstIdx = content!.indexOf("First");
    const secondIdx = content!.indexOf("Second");
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});
