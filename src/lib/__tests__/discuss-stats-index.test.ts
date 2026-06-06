import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getDiscussStatsIndex,
  syncDiscussStatsForSlug,
  removeDiscussStatsForSlug,
  rebuildDiscussStatsIndex,
  statsFromThreads,
} from "../discuss-stats-index";
import {
  createThread,
  addComment,
  resolveThread,
  deleteDiscussions,
  getDiscussionStatsForSlugs,
  _resetTimestamp,
} from "../talk";
import { _resetLocks } from "../lock";
import { _resetStorage } from "../storage";
import type { TalkThread } from "../types";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "discuss-stats-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetTimestamp();
  _resetLocks();
  _resetStorage();
});

afterEach(async () => {
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function thread(status: TalkThread["status"]): TalkThread {
  return { pageSlug: "p", title: "t", status, created: "", updated: "", comments: [] };
}

/** Seed an empty-but-present index so incremental hooks apply (not no-op). */
async function seedEmptyIndex() {
  await rebuildDiscussStatsIndex(); // no discuss files → writes `{}` (present, empty)
}

describe("no-op until seeded", () => {
  it("getDiscussStatsIndex returns null when absent", async () => {
    expect(await getDiscussStatsIndex()).toBeNull();
  });

  it("syncDiscussStatsForSlug no-ops before any rebuild (reader stays null)", async () => {
    await syncDiscussStatsForSlug("p", [thread("open")]);
    expect(await getDiscussStatsIndex()).toBeNull(); // not fabricated from one write
  });

  it("removeDiscussStatsForSlug no-ops before any rebuild", async () => {
    await removeDiscussStatsForSlug("p");
    expect(await getDiscussStatsIndex()).toBeNull();
  });

  it("rebuild seeds an empty-but-present index, then incremental updates apply", async () => {
    await seedEmptyIndex();
    expect(await getDiscussStatsIndex()).toEqual({});
    await syncDiscussStatsForSlug("p", [thread("open")]);
    expect((await getDiscussStatsIndex())?.p).toEqual({ total: 1, open: 1 });
  });
});

describe("syncDiscussStatsForSlug / removeDiscussStatsForSlug (after seeding)", () => {
  beforeEach(seedEmptyIndex);

  it("upserts {total, open} from the in-memory threads", async () => {
    await syncDiscussStatsForSlug("p", [thread("open"), thread("resolved")]);
    expect((await getDiscussStatsIndex())?.p).toEqual({ total: 2, open: 1 });
  });

  it("updates in place on re-sync", async () => {
    await syncDiscussStatsForSlug("p", [thread("open")]);
    await syncDiscussStatsForSlug("p", [thread("open"), thread("open")]);
    expect((await getDiscussStatsIndex())?.p).toEqual({ total: 2, open: 2 });
  });

  it("remove drops the entry", async () => {
    await syncDiscussStatsForSlug("p", [thread("open")]);
    await removeDiscussStatsForSlug("p");
    expect((await getDiscussStatsIndex())?.p).toBeUndefined();
  });
});

describe("talk mutations maintain the index (after seeding)", () => {
  beforeEach(seedEmptyIndex);

  it("createThread / addComment / resolveThread keep stats fresh", async () => {
    await createThread("p", "Title", "alice", "first");
    expect((await getDiscussStatsIndex())?.p).toEqual({ total: 1, open: 1 });

    await addComment("p", 0, "bob", "reply");
    expect((await getDiscussStatsIndex())?.p).toEqual({ total: 1, open: 1 });

    await resolveThread("p", 0, "resolved");
    expect((await getDiscussStatsIndex())?.p).toEqual({ total: 1, open: 0 });
  });

  it("deleteDiscussions removes the slug entry", async () => {
    await createThread("p", "Title", "alice", "first");
    await deleteDiscussions("p");
    expect((await getDiscussStatsIndex())?.p).toBeUndefined();
  });
});

describe("rebuildDiscussStatsIndex", () => {
  it("scans the discuss dir and rebuilds all entries", async () => {
    await createThread("a", "A", "alice", "x");
    await createThread("b", "B", "bob", "y");
    await resolveThread("b", 0, "resolved");
    await rebuildDiscussStatsIndex();
    const idx = await getDiscussStatsIndex();
    expect(idx?.a).toEqual({ total: 1, open: 1 });
    expect(idx?.b).toEqual({ total: 1, open: 0 });
  });
});

describe("getDiscussionStatsForSlugs read parity (fast path vs fallback)", () => {
  it("statsFromThreads counts correctly", () => {
    expect(statsFromThreads([thread("open"), thread("resolved")])).toEqual({
      total: 2,
      open: 1,
    });
  });

  it("fallback directory scan (empty index) matches the populated fast path", async () => {
    // Write discuss files directly so the index is NEVER maintained.
    const discussDir = path.join(tmpDir, "discuss");
    await fs.mkdir(discussDir, { recursive: true });
    await fs.writeFile(
      path.join(discussDir, "a.json"),
      JSON.stringify([thread("open"), thread("resolved")]),
      "utf-8",
    );

    // Index is absent → read falls back to the directory scan.
    expect(await getDiscussStatsIndex()).toBeNull();
    const fallback = await getDiscussionStatsForSlugs(["a", "missing"]);
    expect(fallback.get("a")).toEqual({ total: 2, open: 1 });
    expect(fallback.get("missing")).toEqual({ total: 0, open: 0 });

    // Rebuild → fast path → SAME result.
    await rebuildDiscussStatsIndex();
    expect(Object.keys((await getDiscussStatsIndex())!).length).toBeGreaterThan(0);
    const fast = await getDiscussionStatsForSlugs(["a", "missing"]);
    expect(fast.get("a")).toEqual(fallback.get("a"));
    expect(fast.get("missing")).toEqual(fallback.get("missing"));
  });
});
