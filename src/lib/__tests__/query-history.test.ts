import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { appendQuery, listQueries, markSaved } from "../query-history";
import { _resetLocks } from "../lock";

let tmpDir: string;
let originalWikiDir: string | undefined;

beforeEach(async () => {
  _resetLocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qhist-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
});

afterEach(async () => {
  if (originalWikiDir === undefined) {
    delete process.env.WIKI_DIR;
  } else {
    process.env.WIKI_DIR = originalWikiDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("appendQuery", () => {
  it("creates history file and appends entry", async () => {
    const entry = await appendQuery({
      question: "What is machine learning?",
      answer: "Machine learning is...",
      sources: ["machine-learning"],
      timestamp: new Date().toISOString(),
    });

    expect(entry.id).toBeTruthy();
    expect(entry.question).toBe("What is machine learning?");
    expect(entry.answer).toBe("Machine learning is...");
    expect(entry.sources).toEqual(["machine-learning"]);

    // File should exist
    const filePath = path.join(tmpDir, "wiki", "query-history.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(entry.id);
  });

  it("appends multiple entries in order", async () => {
    await appendQuery({
      question: "Q1",
      answer: "A1",
      sources: [],
      timestamp: "2025-01-01T00:00:00Z",
    });
    await appendQuery({
      question: "Q2",
      answer: "A2",
      sources: ["page-a"],
      timestamp: "2025-01-02T00:00:00Z",
    });
    await appendQuery({
      question: "Q3",
      answer: "A3",
      sources: [],
      timestamp: "2025-01-03T00:00:00Z",
    });

    const filePath = path.join(tmpDir, "wiki", "query-history.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveLength(3);
    expect(data[0].question).toBe("Q1");
    expect(data[1].question).toBe("Q2");
    expect(data[2].question).toBe("Q3");
  });
});

describe("listQueries", () => {
  it("returns entries most recent first", async () => {
    await appendQuery({
      question: "First",
      answer: "A1",
      sources: [],
      timestamp: "2025-01-01T00:00:00Z",
    });
    await appendQuery({
      question: "Second",
      answer: "A2",
      sources: [],
      timestamp: "2025-01-02T00:00:00Z",
    });

    const entries = await listQueries();
    expect(entries).toHaveLength(2);
    expect(entries[0].question).toBe("Second");
    expect(entries[1].question).toBe("First");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      await appendQuery({
        question: `Q${i}`,
        answer: `A${i}`,
        sources: [],
        timestamp: new Date(2025, 0, i + 1).toISOString(),
      });
    }

    const entries = await listQueries(3);
    expect(entries).toHaveLength(3);
    // Most recent first
    expect(entries[0].question).toBe("Q9");
    expect(entries[1].question).toBe("Q8");
    expect(entries[2].question).toBe("Q7");
  });

  it("returns empty array when no history file exists", async () => {
    // Ensure wiki dir exists but no history file
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    const entries = await listQueries();
    expect(entries).toEqual([]);
  });

  it("returns empty array when wiki dir does not exist", async () => {
    process.env.WIKI_DIR = path.join(tmpDir, "nonexistent");
    const entries = await listQueries();
    expect(entries).toEqual([]);
  });

  it("handles malformed JSON file gracefully", async () => {
    const wikiDir = path.join(tmpDir, "wiki");
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, "query-history.json"), "not json!", "utf-8");

    const entries = await listQueries();
    expect(entries).toEqual([]);
  });
});

describe("markSaved", () => {
  it("updates savedAs field on the matching entry", async () => {
    const e1 = await appendQuery({
      question: "Q1",
      answer: "A1",
      sources: [],
      timestamp: "2025-01-01T00:00:00Z",
    });
    const e2 = await appendQuery({
      question: "Q2",
      answer: "A2",
      sources: [],
      timestamp: "2025-01-02T00:00:00Z",
    });

    await markSaved(e1.id, "answer-q1");

    const entries = await listQueries();
    const updated1 = entries.find((e) => e.id === e1.id);
    const updated2 = entries.find((e) => e.id === e2.id);

    expect(updated1?.savedAs).toBe("answer-q1");
    expect(updated2?.savedAs).toBeUndefined();
  });

  it("does nothing for non-existent id", async () => {
    await appendQuery({
      question: "Q1",
      answer: "A1",
      sources: [],
      timestamp: "2025-01-01T00:00:00Z",
    });

    // Should not throw
    await markSaved("nonexistent-id", "some-slug");

    const entries = await listQueries();
    expect(entries).toHaveLength(1);
    expect(entries[0].savedAs).toBeUndefined();
  });
});

describe("max history cap", () => {
  it("trims oldest entries when exceeding 200", async () => {
    // Seed 200 entries directly into the history file to avoid 200+
    // sequential appendQuery calls (each does lock + read + write).
    const wikiDir = path.join(tmpDir, "wiki");
    await fs.mkdir(wikiDir, { recursive: true });

    const seed: Array<{ id: string; question: string; answer: string; sources: string[]; timestamp: string }> = [];
    for (let i = 0; i < 200; i++) {
      seed.push({
        id: `seed-${i}`,
        question: `Q${i}`,
        answer: `A${i}`,
        sources: [],
        timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(),
      });
    }
    await fs.writeFile(
      path.join(wikiDir, "query-history.json"),
      JSON.stringify(seed, null, 2),
      "utf-8",
    );

    // Append 5 more entries (bringing total to 205, should trim to 200)
    for (let i = 200; i < 205; i++) {
      await appendQuery({
        question: `Q${i}`,
        answer: `A${i}`,
        sources: [],
        timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(),
      });
    }

    const entries = await listQueries();
    expect(entries).toHaveLength(200);

    // Most recent should be Q204, oldest should be Q5 (0-4 trimmed)
    expect(entries[0].question).toBe("Q204");
    expect(entries[entries.length - 1].question).toBe("Q5");
  });
});
