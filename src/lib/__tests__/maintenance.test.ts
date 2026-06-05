import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  ensureDirectories,
  writeWikiPageWithSideEffects,
  serializeFrontmatter,
  type Frontmatter,
} from "../wiki";
import { createThread, addComment } from "../talk";
import { scanForMaintenance } from "../maintenance";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};
const TODAY = new Date().toISOString().slice(0, 10);
const PAST = "2020-01-01";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "maint-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
  await ensureDirectories();
});

afterEach(async () => {
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function seed(slug: string, over: Partial<Frontmatter> = {}) {
  const fm: Frontmatter = {
    created: PAST,
    updated: PAST, // old, so not skipped as "edited today"
    owner: "alice",
    visibility: "public",
    authors: ["alice"],
    contributors: [],
    confidence: 0.7,
    expiry: "2099-01-01",
    tags: [],
    disputed: false,
    ...over,
  };
  await writeWikiPageWithSideEffects({
    slug,
    title: slug,
    content: serializeFrontmatter(fm, `# ${slug}\n\nBody.`),
    summary: `Summary for ${slug}.`,
    logOp: "ingest",
    crossRefSource: null,
  });
}

describe("scanForMaintenance", () => {
  it("enqueues a staleness task for an expired page with a source_url", async () => {
    await seed("stale", { expiry: PAST, source_url: "https://example.com/s" });
    const tasks = await scanForMaintenance();
    expect(tasks).toContainEqual({ kind: "maintain", op: "staleness", slug: "stale" });
  });

  it("does NOT flag an expired page with no source_url (nothing to refresh from)", async () => {
    await seed("expired-nosource", { expiry: PAST });
    expect(await scanForMaintenance()).toHaveLength(0);
  });

  it("enqueues a reconcile when a disputed page has an open thread awaiting a human reply", async () => {
    await seed("disputed", { disputed: true });
    await createThread("disputed", "Issue", "bob", "This claim looks wrong.");
    const tasks = await scanForMaintenance();
    expect(tasks).toContainEqual({
      kind: "maintain",
      op: "reconcile",
      slug: "disputed",
      threadIndex: 0,
    });
  });

  it("skips a disputed thread yoyo already answered (last comment is an agent)", async () => {
    await seed("answered", { disputed: true });
    await createThread("answered", "Issue", "bob", "Wrong claim.");
    await addComment("answered", 0, "bob--yoyo", "I looked — keeping both views (disputed).");
    expect(await scanForMaintenance()).toHaveLength(0);
  });

  it("enqueues a fix for a legacy page missing all yopedia schema fields", async () => {
    // Write a page with only owner/visibility/updated — no confidence/authors/expiry.
    await writeWikiPageWithSideEffects({
      slug: "legacy",
      title: "legacy",
      content: serializeFrontmatter(
        { owner: "alice", visibility: "public", updated: PAST } as Frontmatter,
        "# legacy\n\nOld page.",
      ),
      summary: "legacy",
      logOp: "ingest",
      crossRefSource: null,
    });
    const tasks = await scanForMaintenance();
    expect(tasks).toContainEqual({
      kind: "maintain",
      op: "fix",
      slug: "legacy",
      lintType: "unmigrated-page",
    });
  });

  it("enqueues a fix to clear a dangling supersedes reference", async () => {
    await seed("rev", { supersedes: "deleted-page" }); // target not seeded → dangling
    const tasks = await scanForMaintenance();
    expect(tasks).toContainEqual({
      kind: "maintain",
      op: "fix",
      slug: "rev",
      lintType: "supersedes-dangling",
    });
  });

  it("enqueues a broken-link fix for each dead wiki link in a page", async () => {
    // Seed a target page and a page that links to both a live and a dead slug.
    await seed("target-exists");
    // Write a page whose body has links to both an existing and a non-existing slug.
    const fm: Frontmatter = {
      created: PAST,
      updated: PAST,
      owner: "alice",
      visibility: "public",
      authors: ["alice"],
      contributors: [],
      confidence: 0.7,
      expiry: "2099-01-01",
      tags: [],
      disputed: false,
    };
    await writeWikiPageWithSideEffects({
      slug: "has-broken",
      title: "has-broken",
      content: serializeFrontmatter(
        fm,
        "# Has Broken\n\nSee [existing](target-exists.md) and [dead](no-such-page.md).",
      ),
      summary: "Has broken links.",
      logOp: "ingest",
      crossRefSource: null,
    });
    const tasks = await scanForMaintenance();
    expect(tasks).toContainEqual({
      kind: "maintain",
      op: "fix",
      slug: "has-broken",
      lintType: "broken-link",
      targetSlug: "no-such-page",
    });
    // The existing link should NOT produce a task.
    expect(tasks).not.toContainEqual(
      expect.objectContaining({ targetSlug: "target-exists" }),
    );
  });

  it("emits multiple broken-link tasks for multiple dead links in one page", async () => {
    const fm: Frontmatter = {
      created: PAST,
      updated: PAST,
      owner: "alice",
      visibility: "public",
      authors: ["alice"],
      contributors: [],
      confidence: 0.7,
      expiry: "2099-01-01",
      tags: [],
      disputed: false,
    };
    await writeWikiPageWithSideEffects({
      slug: "multi-broken",
      title: "multi-broken",
      content: serializeFrontmatter(
        fm,
        "# Multi\n\n[a](dead-a.md) and [b](dead-b.md).",
      ),
      summary: "Multi broken.",
      logOp: "ingest",
      crossRefSource: null,
    });
    const tasks = await scanForMaintenance();
    const brokenTasks = tasks.filter(
      (t) => t.kind === "maintain" && t.op === "fix" && t.lintType === "broken-link",
    );
    expect(brokenTasks).toHaveLength(2);
    expect(brokenTasks).toContainEqual(
      expect.objectContaining({ slug: "multi-broken", targetSlug: "dead-a" }),
    );
    expect(brokenTasks).toContainEqual(
      expect.objectContaining({ slug: "multi-broken", targetSlug: "dead-b" }),
    );
  });

  it("never flags a PRIVATE page (commons-only; avoids the reingest-fork loop)", async () => {
    await seed("priv-stale", {
      visibility: "private",
      expiry: PAST,
      source_url: "https://example.com/s",
    });
    await seed("priv-disputed", { visibility: "private", disputed: true });
    await createThread("priv-disputed", "Issue", "bob", "Wrong.");
    expect(await scanForMaintenance()).toHaveLength(0);
  });

  it("skips a page edited today (let recent changes settle)", async () => {
    await seed("fresh", { expiry: PAST, source_url: "https://x.com", updated: TODAY });
    expect(await scanForMaintenance()).toHaveLength(0);
  });

  it("caps the number of tasks per scan", async () => {
    for (let i = 0; i < 5; i++) {
      await seed(`stale-${i}`, { expiry: PAST, source_url: `https://x.com/${i}` });
    }
    expect(await scanForMaintenance(2)).toHaveLength(2);
  });
});
