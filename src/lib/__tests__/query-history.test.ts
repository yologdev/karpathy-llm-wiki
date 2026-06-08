import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { appendQuery, listQueries, markSaved } from "../query-history";
import { _resetLocks } from "../lock";

// History is per-asker now; tests append/list under a fixed owner.
const OWNER = "tester";

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
      owner: OWNER,
    });

    expect(entry.id).toBeTruthy();
    expect(entry.question).toBe("What is machine learning?");
    expect(entry.answer).toBe("Machine learning is...");
    expect(entry.sources).toEqual(["machine-learning"]);

    // The per-owner file should exist (physical isolation, not a shared file).
    const filePath = path.join(tmpDir, "wiki", "query-history", "tester.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(entry.id);
  });

  it("appends multiple entries in order", async () => {
    await appendQuery({ question: "Q1", answer: "A1", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: OWNER });
    await appendQuery({ question: "Q2", answer: "A2", sources: ["page-a"], timestamp: "2025-01-02T00:00:00Z", owner: OWNER });
    await appendQuery({ question: "Q3", answer: "A3", sources: [], timestamp: "2025-01-03T00:00:00Z", owner: OWNER });

    const filePath = path.join(tmpDir, "wiki", "query-history", "tester.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveLength(3);
    expect(data[0].question).toBe("Q1");
    expect(data[1].question).toBe("Q2");
    expect(data[2].question).toBe("Q3");
  });
});

describe("per-owner physical isolation + legacy migration", () => {
  const legacyPath = () => path.join(tmpDir, "wiki", "query-history.json");
  const ownerFile = (owner: string) =>
    path.join(tmpDir, "wiki", "query-history", `${owner}.json`);

  it("writes each asker to a separate file and never a shared one", async () => {
    await appendQuery({ question: "alice q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" });
    await appendQuery({ question: "bob q", answer: "b", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: "bob" });

    expect(JSON.parse(await fs.readFile(ownerFile("alice"), "utf-8"))).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(ownerFile("bob"), "utf-8"))).toHaveLength(1);
    // No shared query-history.json — there's no cross-user file to over-read.
    await expect(fs.access(legacyPath())).rejects.toThrow();
  });

  it("migrates a legacy shared file into per-owner files, then deletes it", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    await fs.writeFile(
      legacyPath(),
      JSON.stringify([
        { id: "1", question: "alice q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" },
        { id: "2", question: "bob q", answer: "b", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: "bob" },
        { id: "3", question: "orphan q", answer: "o", sources: [], timestamp: "2025-01-03T00:00:00Z" }, // no owner → dropped
      ]),
      "utf-8",
    );

    // First read for alice triggers the migration.
    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["alice q"]);
    // Bob's entry was preserved (lossless), the orphan dropped, legacy removed.
    expect((await listQueries(undefined, "bob")).map((e) => e.question)).toEqual(["bob q"]);
    await expect(fs.access(legacyPath())).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(ownerFile("alice"), "utf-8"))).toHaveLength(1);
  });

  it("a new entry survives the migration (appended after legacy entries)", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    await fs.writeFile(
      legacyPath(),
      JSON.stringify([
        { id: "old", question: "old q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" },
      ]),
      "utf-8",
    );

    await appendQuery({ question: "new q", answer: "b", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: "alice" });

    // Most-recent-first: the new entry, then the migrated legacy one.
    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["new q", "old q"]);
    await expect(fs.access(legacyPath())).rejects.toThrow();
  });
});

describe("listQueries", () => {
  it("returns entries most recent first", async () => {
    await appendQuery({ question: "First", answer: "A1", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: OWNER });
    await appendQuery({ question: "Second", answer: "A2", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: OWNER });

    const entries = await listQueries(undefined, OWNER);
    expect(entries).toHaveLength(2);
    expect(entries[0].question).toBe("Second");
    expect(entries[1].question).toBe("First");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      await appendQuery({ question: `Q${i}`, answer: `A${i}`, sources: [], timestamp: new Date(2025, 0, i + 1).toISOString(), owner: OWNER });
    }

    const entries = await listQueries(3, OWNER);
    expect(entries).toHaveLength(3);
    expect(entries[0].question).toBe("Q9");
    expect(entries[1].question).toBe("Q8");
    expect(entries[2].question).toBe("Q7");
  });

  it("is per-asker: returns only the owner's entries, none for anonymous", async () => {
    await appendQuery({ question: "alice q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" });
    await appendQuery({ question: "bob q", answer: "b", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: "bob" });

    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["alice q"]);
    expect((await listQueries(undefined, "bob")).map((e) => e.question)).toEqual(["bob q"]);
    // Anonymous (no owner) sees nothing.
    expect(await listQueries()).toEqual([]);
    expect(await listQueries(undefined, null)).toEqual([]);
  });

  it("returns empty array when no history file exists", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    const entries = await listQueries(undefined, OWNER);
    expect(entries).toEqual([]);
  });

  it("returns empty array when wiki dir does not exist", async () => {
    process.env.WIKI_DIR = path.join(tmpDir, "nonexistent");
    const entries = await listQueries(undefined, OWNER);
    expect(entries).toEqual([]);
  });

  it("handles malformed JSON file gracefully", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wikiDir = path.join(tmpDir, "wiki");
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, "query-history.json"), "not json!", "utf-8");

    const entries = await listQueries(undefined, OWNER);
    expect(entries).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe("markSaved", () => {
  it("updates savedAs field on the matching entry", async () => {
    const e1 = await appendQuery({ question: "Q1", answer: "A1", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: OWNER });
    const e2 = await appendQuery({ question: "Q2", answer: "A2", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: OWNER });

    await markSaved(e1.id, "answer-q1", OWNER);

    const entries = await listQueries(undefined, OWNER);
    const updated1 = entries.find((e) => e.id === e1.id);
    const updated2 = entries.find((e) => e.id === e2.id);

    expect(updated1?.savedAs).toBe("answer-q1");
    expect(updated2?.savedAs).toBeUndefined();
  });

  it("does nothing for non-existent id", async () => {
    await appendQuery({ question: "Q1", answer: "A1", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: OWNER });

    await markSaved("nonexistent-id", "some-slug", OWNER);

    const entries = await listQueries(undefined, OWNER);
    expect(entries).toHaveLength(1);
    expect(entries[0].savedAs).toBeUndefined();
  });

  it("does not let a non-owner mark someone else's entry", async () => {
    const e = await appendQuery({ question: "Q", answer: "A", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" });
    await markSaved(e.id, "sneaky", "bob");
    const entries = await listQueries(undefined, "alice");
    expect(entries[0].savedAs).toBeUndefined();
  });
});

describe("max history cap", () => {
  it("trims oldest entries when exceeding 200", async () => {
    const wikiDir = path.join(tmpDir, "wiki");
    await fs.mkdir(wikiDir, { recursive: true });

    const seed: Array<{ id: string; question: string; answer: string; sources: string[]; timestamp: string; owner: string }> = [];
    for (let i = 0; i < 200; i++) {
      seed.push({ id: `seed-${i}`, question: `Q${i}`, answer: `A${i}`, sources: [], timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(), owner: OWNER });
    }
    await fs.writeFile(path.join(wikiDir, "query-history.json"), JSON.stringify(seed, null, 2), "utf-8");

    for (let i = 200; i < 205; i++) {
      await appendQuery({ question: `Q${i}`, answer: `A${i}`, sources: [], timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(), owner: OWNER });
    }

    const entries = await listQueries(undefined, OWNER);
    expect(entries).toHaveLength(200);
    expect(entries[0].question).toBe("Q204");
    expect(entries[entries.length - 1].question).toBe("Q5");
  });
});

describe("hardening — isolation, idempotency, no-clobber", () => {
  const wikiDir = () => path.join(tmpDir, "wiki");
  const legacyPath = () => path.join(wikiDir(), "query-history.json");
  const ownerFile = (key: string) =>
    path.join(wikiDir(), "query-history", `${key}.json`);

  it("never clobbers history when a read fails (corrupt file → throws, file untouched)", async () => {
    await fs.mkdir(path.join(wikiDir(), "query-history"), { recursive: true });
    await fs.writeFile(ownerFile("tester"), "not json!", "utf-8");

    await expect(
      appendQuery({ question: "q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "tester" }),
    ).rejects.toThrow();

    // The unreadable file is left intact — NOT overwritten with [newEntry].
    expect(await fs.readFile(ownerFile("tester"), "utf-8")).toBe("not json!");
  });

  it("ownerKey is injective: handles differing only by stripped chars don't collide", async () => {
    await appendQuery({ question: "dotted", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "al.ice" });
    await appendQuery({ question: "plain", answer: "b", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: "alice" });

    expect((await listQueries(undefined, "al.ice")).map((e) => e.question)).toEqual(["dotted"]);
    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["plain"]);
  });

  it("all-symbol handles don't collapse into a shared/empty file", async () => {
    await appendQuery({ question: "bang", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "!!!" });
    await appendQuery({ question: "hash", answer: "b", sources: [], timestamp: "2025-01-02T00:00:00Z", owner: "###" });

    expect((await listQueries(undefined, "!!!")).map((e) => e.question)).toEqual(["bang"]);
    expect((await listQueries(undefined, "###")).map((e) => e.question)).toEqual(["hash"]);
    // No shared `.json` catch-all (the old empty-key bug).
    await expect(fs.access(ownerFile(""))).rejects.toThrow();
  });

  it("the cap is per-owner: one owner at 200 doesn't trim another", async () => {
    for (let i = 0; i < 205; i++) {
      await appendQuery({ question: `a${i}`, answer: "x", sources: [], timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(), owner: "alice" });
    }
    for (let i = 0; i < 3; i++) {
      await appendQuery({ question: `b${i}`, answer: "x", sources: [], timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString(), owner: "bob" });
    }
    expect(await listQueries(undefined, "alice")).toHaveLength(200);
    expect(await listQueries(undefined, "bob")).toHaveLength(3);
  });

  it("migration is idempotent if the legacy file reappears (dedupe by id)", async () => {
    await fs.mkdir(wikiDir(), { recursive: true });
    const legacy = [{ id: "x1", question: "q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" }];
    await fs.writeFile(legacyPath(), JSON.stringify(legacy), "utf-8");

    expect(await listQueries(undefined, "alice")).toHaveLength(1);
    await expect(fs.access(legacyPath())).rejects.toThrow();

    // Legacy reappears with the SAME id (e.g. a failed delete that later resolves).
    await fs.writeFile(legacyPath(), JSON.stringify(legacy), "utf-8");
    expect(await listQueries(undefined, "alice")).toHaveLength(1); // no duplicate
  });

  it("merges legacy entries BELOW pre-existing per-owner entries (most-recent-first)", async () => {
    await fs.mkdir(path.join(wikiDir(), "query-history"), { recursive: true });
    await fs.writeFile(ownerFile("alice"), JSON.stringify([
      { id: "new", question: "newer q", answer: "a", sources: [], timestamp: "2025-01-05T00:00:00Z", owner: "alice" },
    ]), "utf-8");
    await fs.writeFile(legacyPath(), JSON.stringify([
      { id: "old", question: "older q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner: "alice" },
    ]), "utf-8");

    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["newer q", "older q"]);
  });
});
