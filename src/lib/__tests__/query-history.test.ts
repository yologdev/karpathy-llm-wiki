import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { appendQuery, listQueries, markSaved } from "../query-history";
import { tenantForOwner } from "../wiki";
import { _resetLocks } from "../lock";
import { _resetStorage } from "../storage";

// History is per-asker, stored in the asker's tenant silo.
const OWNER = "tester";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalDataDir: string | undefined;

beforeEach(async () => {
  _resetLocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qhist-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalDataDir = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.DATA_DIR = tmpDir; // silo paths (tenants/<t>/…) resolve against this
  _resetStorage();
});

afterEach(async () => {
  if (originalWikiDir === undefined) delete process.env.WIKI_DIR;
  else process.env.WIKI_DIR = originalWikiDir;
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** The silo history file for an owner. */
const siloFile = (owner: string) =>
  path.join(tmpDir, "tenants", tenantForOwner(owner), "query-history.json");
/** The legacy shared single-file store. */
const legacySharedPath = () => path.join(tmpDir, "wiki", "query-history.json");
/** A legacy interim per-owner file (PR #493). */
const legacyPerOwnerPath = (key: string) =>
  path.join(tmpDir, "wiki", "query-history", `${key}.json`);

const entry = (owner: string, over: Partial<Record<string, unknown>> = {}) => ({
  question: "q", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z", owner, ...over,
});

describe("appendQuery", () => {
  it("creates the silo history file and appends an entry", async () => {
    const e = await appendQuery(entry(OWNER, { question: "What is machine learning?", answer: "ML is..." }));
    expect(e.id).toBeTruthy();
    expect(e.question).toBe("What is machine learning?");

    const data = JSON.parse(await fs.readFile(siloFile(OWNER), "utf-8"));
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(e.id);
  });

  it("appends multiple entries in order", async () => {
    await appendQuery(entry(OWNER, { question: "Q1", timestamp: "2025-01-01T00:00:00Z" }));
    await appendQuery(entry(OWNER, { question: "Q2", timestamp: "2025-01-02T00:00:00Z" }));
    await appendQuery(entry(OWNER, { question: "Q3", timestamp: "2025-01-03T00:00:00Z" }));

    const data = JSON.parse(await fs.readFile(siloFile(OWNER), "utf-8"));
    expect(data.map((d: { question: string }) => d.question)).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("does not persist an owner-less entry (returns it for optimistic UI)", async () => {
    const e = await appendQuery({ question: "anon", answer: "a", sources: [], timestamp: "2025-01-01T00:00:00Z" });
    expect(e.id).toBeTruthy();
    expect(await listQueries(undefined, null)).toEqual([]);
  });

  it("round-trips the answer format so a restored HTML entry re-renders sandboxed", async () => {
    await appendQuery(entry(OWNER, { question: "chart it", answer: "<!doctype html>…", format: "html" }));
    const [restored] = await listQueries(undefined, OWNER);
    expect(restored.format).toBe("html");
  });
});

describe("listQueries", () => {
  it("returns entries most recent first", async () => {
    await appendQuery(entry(OWNER, { question: "First", timestamp: "2025-01-01T00:00:00Z" }));
    await appendQuery(entry(OWNER, { question: "Second", timestamp: "2025-01-02T00:00:00Z" }));
    expect((await listQueries(undefined, OWNER)).map((e) => e.question)).toEqual(["Second", "First"]);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 10; i++) {
      await appendQuery(entry(OWNER, { question: `Q${i}`, timestamp: new Date(2025, 0, i + 1).toISOString() }));
    }
    expect((await listQueries(3, OWNER)).map((e) => e.question)).toEqual(["Q9", "Q8", "Q7"]);
  });

  it("is per-asker: only the owner's entries, none for anonymous", async () => {
    await appendQuery(entry("alice", { question: "alice q" }));
    await appendQuery(entry("bob", { question: "bob q", timestamp: "2025-01-02T00:00:00Z" }));
    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["alice q"]);
    expect((await listQueries(undefined, "bob")).map((e) => e.question)).toEqual(["bob q"]);
    expect(await listQueries()).toEqual([]);
    expect(await listQueries(undefined, null)).toEqual([]);
  });

  it("returns [] when no history exists", async () => {
    expect(await listQueries(undefined, OWNER)).toEqual([]);
  });
});

describe("markSaved", () => {
  it("updates savedAs on the matching entry only", async () => {
    const e1 = await appendQuery(entry(OWNER, { question: "Q1" }));
    const e2 = await appendQuery(entry(OWNER, { question: "Q2", timestamp: "2025-01-02T00:00:00Z" }));
    await markSaved(e1.id, "answer-q1", OWNER);

    const entries = await listQueries(undefined, OWNER);
    expect(entries.find((e) => e.id === e1.id)?.savedAs).toBe("answer-q1");
    expect(entries.find((e) => e.id === e2.id)?.savedAs).toBeUndefined();
  });

  it("cannot mark another owner's entry (different silo file)", async () => {
    const e = await appendQuery(entry("alice", { question: "Q" }));
    await markSaved(e.id, "sneaky", "bob");
    expect((await listQueries(undefined, "alice"))[0].savedAs).toBeUndefined();
  });
});

describe("storage placement + isolation", () => {
  it("stores history inside the tenant silo, not the shared wiki root", async () => {
    await appendQuery(entry("alice", { question: "alice q" }));
    await appendQuery(entry("bob", { question: "bob q", timestamp: "2025-01-02T00:00:00Z" }));

    expect(JSON.parse(await fs.readFile(siloFile("alice"), "utf-8"))).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(siloFile("bob"), "utf-8"))).toHaveLength(1);
    // No shared file at the wiki root.
    await expect(fs.access(legacySharedPath())).rejects.toThrow();
    // The path is under tenants/<tenant>/.
    expect(siloFile("alice")).toContain(path.join("tenants", "alice"));
  });

  it("the cap is per-owner: one owner at 200 doesn't trim another", async () => {
    for (let i = 0; i < 205; i++) {
      await appendQuery(entry("alice", { question: `a${i}`, timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString() }));
    }
    for (let i = 0; i < 3; i++) {
      await appendQuery(entry("bob", { question: `b${i}`, timestamp: new Date(2025, 0, 1, 0, 0, i).toISOString() }));
    }
    expect(await listQueries(undefined, "alice")).toHaveLength(200);
    expect(await listQueries(undefined, "bob")).toHaveLength(3);
  });

  it("never clobbers history when a read fails (corrupt file → throws, untouched)", async () => {
    await fs.mkdir(path.dirname(siloFile(OWNER)), { recursive: true });
    await fs.writeFile(siloFile(OWNER), "not json!", "utf-8");
    await expect(appendQuery(entry(OWNER))).rejects.toThrow();
    expect(await fs.readFile(siloFile(OWNER), "utf-8")).toBe("not json!");
  });
});

describe("legacy migration → tenant silo", () => {
  it("migrates the shared file into per-tenant silo files, dropping owner-less + deleting it", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    await fs.writeFile(legacySharedPath(), JSON.stringify([
      { id: "1", ...entry("alice", { question: "alice q" }) },
      { id: "2", ...entry("bob", { question: "bob q", timestamp: "2025-01-02T00:00:00Z" }) },
      { id: "3", question: "orphan", answer: "o", sources: [], timestamp: "2025-01-03T00:00:00Z" }, // no owner
    ]), "utf-8");

    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["alice q"]);
    expect((await listQueries(undefined, "bob")).map((e) => e.question)).toEqual(["bob q"]);
    // Lossless for owned entries; orphan dropped; shared file removed once empty.
    await expect(fs.access(legacySharedPath())).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(siloFile("alice"), "utf-8"))).toHaveLength(1);
  });

  it("migrates an interim per-owner file (PR #493) into the silo, then removes it", async () => {
    const key = "alice"; // legacyOwnerKey("alice") === "alice"
    await fs.mkdir(path.join(tmpDir, "wiki", "query-history"), { recursive: true });
    await fs.writeFile(legacyPerOwnerPath(key), JSON.stringify([
      { id: "p1", ...entry("alice", { question: "interim q" }) },
    ]), "utf-8");

    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["interim q"]);
    await expect(fs.access(legacyPerOwnerPath(key))).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(siloFile("alice"), "utf-8"))).toHaveLength(1);
  });

  it("a new entry survives migration (appended above the migrated legacy ones)", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    await fs.writeFile(legacySharedPath(), JSON.stringify([
      { id: "old", ...entry("alice", { question: "old q" }) },
    ]), "utf-8");

    await appendQuery(entry("alice", { question: "new q", timestamp: "2025-01-02T00:00:00Z" }));
    expect((await listQueries(undefined, "alice")).map((e) => e.question)).toEqual(["new q", "old q"]);
  });

  it("is idempotent if a legacy file reappears (dedupe by id, no duplication)", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki", "query-history"), { recursive: true });
    const legacy = JSON.stringify([{ id: "x1", ...entry("alice", { question: "q" }) }]);
    await fs.writeFile(legacyPerOwnerPath("alice"), legacy, "utf-8");

    expect(await listQueries(undefined, "alice")).toHaveLength(1);
    // Reappears with the same id (e.g. a failed delete that later resolves).
    await fs.mkdir(path.join(tmpDir, "wiki", "query-history"), { recursive: true });
    await fs.writeFile(legacyPerOwnerPath("alice"), legacy, "utf-8");
    expect(await listQueries(undefined, "alice")).toHaveLength(1); // no duplicate
  });

  it("consolidates BOTH legacy sources for one owner, deduping a shared id (no dup)", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki", "query-history"), { recursive: true });
    await fs.writeFile(legacySharedPath(), JSON.stringify([
      { id: "s1", ...entry("alice", { question: "shared q" }) },
      { id: "dup", ...entry("alice", { question: "from shared" }) },
    ]), "utf-8");
    await fs.writeFile(legacyPerOwnerPath("alice"), JSON.stringify([
      { id: "p1", ...entry("alice", { question: "interim q" }) },
      { id: "dup", ...entry("alice", { question: "from interim" }) }, // same id in both
    ]), "utf-8");

    const ids = (await listQueries(undefined, "alice")).map((e) => e.id).sort();
    expect(ids).toEqual(["dup", "p1", "s1"]); // dup exactly once
    await expect(fs.access(legacySharedPath())).rejects.toThrow();
    await expect(fs.access(legacyPerOwnerPath("alice"))).rejects.toThrow();
  });

  it("prunes the shared file per-owner: keeps bob until bob migrates", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    await fs.writeFile(legacySharedPath(), JSON.stringify([
      { id: "a", ...entry("alice", { question: "alice q" }) },
      { id: "b", ...entry("bob", { question: "bob q" }) },
    ]), "utf-8");

    await listQueries(undefined, "alice");
    // Shared file still exists and now holds ONLY bob's entry.
    const afterAlice = JSON.parse(await fs.readFile(legacySharedPath(), "utf-8"));
    expect(afterAlice.map((e: { owner: string }) => e.owner)).toEqual(["bob"]);

    await listQueries(undefined, "bob");
    await expect(fs.access(legacySharedPath())).rejects.toThrow(); // now empty → deleted
    expect((await listQueries(undefined, "bob")).map((e) => e.question)).toEqual(["bob q"]);
  });

  it("quarantines an unparseable legacy file instead of probing it forever", async () => {
    await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
    await fs.writeFile(legacySharedPath(), "not json!", "utf-8");

    expect(await listQueries(undefined, "alice")).toEqual([]);
    // Original removed; quarantined copy kept for recovery.
    await expect(fs.access(legacySharedPath())).rejects.toThrow();
    expect(await fs.readFile(`${legacySharedPath()}.corrupt`, "utf-8")).toBe("not json!");
  });
});

describe("tenant keying contract", () => {
  it("owners that normalize to the same tenant share one silo file (consistent identity)", async () => {
    // ownerToTenant maps "al.ice" and "al-ice" to the same tenant — the same
    // identity the app uses for pages/raw/discuss, so they intentionally share.
    expect(tenantForOwner("al.ice")).toBe(tenantForOwner("al-ice"));
    await appendQuery(entry("al.ice", { question: "dotted" }));
    await appendQuery(entry("al-ice", { question: "dashed", timestamp: "2025-01-02T00:00:00Z" }));
    expect((await listQueries(undefined, "al.ice")).map((e) => e.question)).toEqual(["dashed", "dotted"]);
    expect((await listQueries(undefined, "al-ice")).map((e) => e.question)).toEqual(["dashed", "dotted"]);
  });
});
