import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getRecentIndex,
  pushRecentEvent,
  removeRecentForSlug,
} from "../recent-index";
import { getTrail, type TrailEvent } from "../trail";
import { getStorage, _resetStorage } from "../storage";
import { _resetLocks } from "../lock";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "recent-index-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
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

function ev(over: Partial<TrailEvent> = {}): TrailEvent {
  return {
    ts: 1000,
    when: "2026-06-06T00:00:00.000Z",
    actor: "alice",
    isAgent: false,
    action: "edited",
    slug: "page-a",
    title: "Page A",
    tenant: "alice",
    ...over,
  };
}

/** Seed an empty-but-present index so incremental hooks apply (not no-op). */
async function seedEmpty() {
  await getStorage().putIndex("recent", []);
}

describe("recent-index", () => {
  it("getRecentIndex returns null when the key is absent (not seeded)", async () => {
    expect(await getRecentIndex()).toBeNull();
  });

  it("pushRecentEvent NO-OPS until the index is seeded", async () => {
    await pushRecentEvent(ev());
    // Still absent — a single write must not fabricate a partial recent list.
    expect(await getRecentIndex()).toBeNull();
  });

  it("removeRecentForSlug no-ops until seeded", async () => {
    await removeRecentForSlug("page-a");
    expect(await getRecentIndex()).toBeNull();
  });

  it("after seeding, push prepends newest-first and dedups", async () => {
    await seedEmpty();
    expect(await getRecentIndex()).toEqual([]);

    await pushRecentEvent(ev({ ts: 1000, slug: "page-a" }));
    await pushRecentEvent(ev({ ts: 2000, slug: "page-b", title: "Page B" }));
    const idx = await getRecentIndex();
    expect(idx?.map((e) => e.slug)).toEqual(["page-b", "page-a"]); // newest first

    // Near-duplicate (same slug+actor+action within the window) collapses.
    await pushRecentEvent(ev({ ts: 2050, slug: "page-b", title: "Page B" }));
    const idx2 = await getRecentIndex();
    expect(idx2?.filter((e) => e.slug === "page-b")).toHaveLength(1);
  });

  it("removeRecentForSlug drops all events for a slug", async () => {
    await seedEmpty();
    await pushRecentEvent(ev({ ts: 1000, slug: "page-a" }));
    await pushRecentEvent(ev({ ts: 2000, slug: "page-b" }));
    await removeRecentForSlug("page-a");
    const idx = await getRecentIndex();
    expect(idx?.map((e) => e.slug)).toEqual(["page-b"]);
  });

  it("getTrail serves the index for anonymous reads, capped to limit", async () => {
    await seedEmpty();
    await pushRecentEvent(ev({ ts: 1000, slug: "page-a" }));
    await pushRecentEvent(ev({ ts: 2000, slug: "page-b" }));
    await pushRecentEvent(ev({ ts: 3000, slug: "page-c" }));
    const trail = await getTrail(2, null);
    expect(trail.map((e) => e.slug)).toEqual(["page-c", "page-b"]);
  });

  it("getTrail resolves every event to the page's CURRENT title", async () => {
    const { updateIndex } = await import("../wiki");
    await seedEmpty();
    // Two ingest events for one page, > the 120s dedup window apart so BOTH
    // survive, captured with two differently-cased snapshot titles.
    await pushRecentEvent(
      ev({ ts: 1000, slug: "agentic-systems", title: "Agentic systems", action: "ingested" }),
    );
    await pushRecentEvent(
      ev({ ts: 500_000, slug: "agentic-systems", title: "agentic systems", action: "ingested" }),
    );
    // The page's CURRENT title (from the wiki index) is the canonical one.
    await updateIndex([
      { title: "Agentic Systems", slug: "agentic-systems", summary: "x" },
    ]);

    const trail = await getTrail(10, null);
    // Both events survive, in newest-first order, both rewritten to the current
    // title (not the stale snapshots).
    expect(trail.map((e) => e.ts)).toEqual([500_000, 1000]);
    expect(trail.map((e) => e.title)).toEqual(["Agentic Systems", "Agentic Systems"]);
  });

  it("getTrail keeps the snapshot title when the slug isn't in the readable set", async () => {
    await seedEmpty();
    // No wiki-index entry for "ghost" → listReadableWikiPages returns [] → the
    // event keeps its original snapshot title rather than being dropped.
    await pushRecentEvent(ev({ ts: 1000, slug: "ghost", title: "Snapshot Name" }));

    const trail = await getTrail(10, null);
    expect(trail).toHaveLength(1);
    expect(trail[0].title).toBe("Snapshot Name");
  });

  it("getTrail falls back to the scan when the index is unseeded", async () => {
    // No index seeded → getTrail scans; an empty wiki yields no events (and
    // crucially does not throw).
    const trail = await getTrail(10, null);
    expect(Array.isArray(trail)).toBe(true);
    expect(trail).toEqual([]);
  });
});
