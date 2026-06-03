import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "test-user", handle: "test-user" })),
}));

import {
  ensureDirectories,
  readWikiPageWithFrontmatter,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
} from "../wiki";
import type { Frontmatter } from "../frontmatter";

// ---------------------------------------------------------------------------
// Temp directory setup — mirrors lifecycle.test.ts approach
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-routes-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
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
// POST /api/wiki — manual page creation metadata
// ---------------------------------------------------------------------------

describe("POST /api/wiki — yopedia metadata", () => {
  // We import the route handler lazily so env vars are set first
  async function callPost(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/wiki/route");
    const req = new Request("http://localhost:3000/api/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it("sets default yopedia frontmatter on new page", async () => {
    const res = await callPost({
      slug: "test-meta",
      content: "# Test Meta\n\nSome content.",
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("test-meta");
    expect(page).not.toBeNull();
    const fm = page!.frontmatter;

    const today = new Date().toISOString().slice(0, 10);

    // Core yopedia fields
    expect(fm.title).toBe("Test Meta");
    expect(fm.confidence).toBe(0.5);
    // Author/owner come from the authenticated session (mocked test-user).
    expect(fm.authors).toEqual(["test-user"]);
    expect(fm.owner).toBe("test-user");
    expect(fm.visibility).toBe("public");
    expect(fm.contributors).toEqual([]);
    expect(fm.sources).toEqual([]);

    // Date fields
    expect(fm.created).toBe(today);
    expect(fm.updated).toBe(today);
    expect(fm.valid_from).toBe(today);

    // Schema defaults
    expect(fm.disputed).toBe(false);
    expect(fm.aliases).toEqual([]);
    expect(fm.tags).toEqual([]);

    // expiry should be ~90 days from now (YYYY-MM-DD format)
    expect(typeof fm.expiry).toBe("string");
    const expiryStr = fm.expiry as string;
    expect(expiryStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Verify expiry is in the future
    expect(new Date(expiryStr).getTime()).toBeGreaterThan(Date.now());
  });

  it("sets default expiry to ~90 days from creation date", async () => {
    const res = await callPost({
      slug: "expiry-check",
      content: "# Expiry Check\n\nVerify 90-day default.",
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("expiry-check");
    expect(page).not.toBeNull();
    const fm = page!.frontmatter;

    const expiryStr = fm.expiry as string;
    const expiryMs = new Date(expiryStr).getTime();
    const nowMs = Date.now();
    const diffDays = (expiryMs - nowMs) / (1000 * 60 * 60 * 24);

    // Should be ~90 days (allow ±1 day for test execution time)
    expect(diffDays).toBeGreaterThanOrEqual(89);
    expect(diffDays).toBeLessThanOrEqual(91);
  });

  it("attributes the authenticated principal, ignoring any client-supplied author", async () => {
    const res = await callPost({
      slug: "authored-page",
      content: "# Authored\n\nBy someone.",
      author: "alice", // spoof attempt — must be ignored in favor of the session
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("authored-page");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.authors).toEqual(["test-user"]);
    expect(page!.frontmatter.owner).toBe("test-user");
  });

  it("ignores a client-supplied empty author and uses the session principal", async () => {
    const res = await callPost({
      slug: "empty-author",
      content: "# Empty Author\n\nContent.",
      author: "   ",
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("empty-author");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.authors).toEqual(["test-user"]);
  });

  it("accepts optional tags from request body", async () => {
    const res = await callPost({
      slug: "tagged-page",
      content: "# Tagged Page\n\nContent with tags.",
      tags: ["rust", "agent"],
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("tagged-page");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.tags).toEqual(["rust", "agent"]);
  });

  it("ignores non-string-array tags and defaults to empty", async () => {
    const res = await callPost({
      slug: "bad-tags",
      content: "# Bad Tags\n\nContent.",
      tags: [1, 2, 3],
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("bad-tags");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.tags).toEqual([]);
  });

  it("pages created via POST do not trigger unmigrated-page lint", async () => {
    await callPost({
      slug: "lint-safe",
      content: "# Lint Safe\n\nShould pass lint.",
    });

    const page = await readWikiPageWithFrontmatter("lint-safe");
    expect(page).not.toBeNull();
    const fm = page!.frontmatter;

    // The unmigrated-page check flags pages missing ALL THREE of these
    const hasConfidence = "confidence" in fm;
    const hasAuthors = "authors" in fm;
    const hasExpiry = "expiry" in fm;
    expect(hasConfidence).toBe(true);
    expect(hasAuthors).toBe(true);
    expect(hasExpiry).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/wiki/[slug] — edit metadata tracking
// ---------------------------------------------------------------------------

describe("PUT /api/wiki/[slug] — contributors and updated", () => {
  async function callPut(slug: string, body: Record<string, unknown>) {
    const mod = await import("@/app/api/wiki/[slug]/route");
    const req = new Request(`http://localhost:3000/api/wiki/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return mod.PUT(req, { params: Promise.resolve({ slug }) });
  }

  /** Create a page with full yopedia metadata so PUT has something to edit. */
  async function seedPage(slug: string, fm: Frontmatter = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const defaults: Frontmatter = {
      created: today,
      confidence: 0.5,
      authors: ["original-author"],
      contributors: [],
      expiry: "2099-01-01",
      sources: [],
      ...fm,
    };
    const content = serializeFrontmatter(defaults, `# ${slug}\n\nOriginal content.`);
    await writeWikiPageWithSideEffects({
      slug,
      title: slug,
      content,
      summary: "A test page",
      logOp: "ingest",
      crossRefSource: null,
    });
  }

  it("sets updated timestamp on edit", async () => {
    await seedPage("edit-test");

    const res = await callPut("edit-test", {
      content: "# Edit Test\n\nUpdated content.",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("edit-test");
    expect(page).not.toBeNull();
    const fm = page!.frontmatter;

    const today = new Date().toISOString().slice(0, 10);
    expect(fm.updated).toBe(today);
  });

  it("appends the authenticated editor to contributors on edit", async () => {
    await seedPage("contrib-test");

    const res = await callPut("contrib-test", {
      content: "# Contrib Test\n\nEdited.",
      author: "editor-bob", // ignored — session principal is used
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("contrib-test");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.contributors).toEqual(["test-user"]);
  });

  it("does not duplicate contributors on repeated edits", async () => {
    await seedPage("no-dup-test");

    // First edit
    await callPut("no-dup-test", {
      content: "# No Dup Test\n\nFirst edit.",
    });

    // Second edit by the same (session) person
    const res = await callPut("no-dup-test", {
      content: "# No Dup Test\n\nSecond edit.",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("no-dup-test");
    expect(page).not.toBeNull();

    const contributors = page!.frontmatter.contributors as string[];
    expect(contributors.filter((c) => c === "test-user")).toHaveLength(1);
  });

  it("preserves existing contributors when adding new one", async () => {
    await seedPage("multi-contrib", { contributors: ["first-editor"] });

    const res = await callPut("multi-contrib", {
      content: "# Multi Contrib\n\nAnother edit.",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("multi-contrib");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.contributors).toEqual([
      "first-editor",
      "test-user",
    ]);
  });

  it("preserves existing frontmatter fields on edit", async () => {
    await seedPage("preserve-test", {
      confidence: 0.8,
      authors: ["original"],
      expiry: "2099-06-15",
    });

    const res = await callPut("preserve-test", {
      content: "# Preserve Test\n\nNew content.",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("preserve-test");
    expect(page).not.toBeNull();
    const fm = page!.frontmatter;

    // Original fields should be preserved
    expect(fm.confidence).toBe(0.8);
    expect(fm.authors).toEqual(["original"]);
    expect(fm.expiry).toBe("2099-06-15");
  });

  it("adds the authenticated editor to contributors (writes are always authed)", async () => {
    await seedPage("no-author-edit", { contributors: ["existing"] });

    const res = await callPut("no-author-edit", {
      content: "# No Author Edit\n\nEdited by the signed-in user.",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("no-author-edit");
    expect(page).not.toBeNull();
    // Writes require auth, so the session principal is appended.
    expect(page!.frontmatter.contributors).toEqual(["existing", "test-user"]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/wiki/[slug] — frontmatter-only metadata updates
// ---------------------------------------------------------------------------

describe("PATCH /api/wiki/[slug] — metadata updates", () => {
  async function callPatch(slug: string, body: Record<string, unknown>) {
    const mod = await import("@/app/api/wiki/[slug]/route");
    const req = new Request(`http://localhost:3000/api/wiki/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return mod.PATCH(req, { params: Promise.resolve({ slug }) });
  }

  /** Create a page with full yopedia metadata so PATCH has something to edit. */
  async function seedPage(slug: string, fm: Frontmatter = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const defaults: Frontmatter = {
      created: today,
      confidence: 0.5,
      authors: ["original-author"],
      contributors: [],
      expiry: "2099-01-01",
      sources: [],
      ...fm,
    };
    const content = serializeFrontmatter(defaults, `# ${slug}\n\nOriginal content.`);
    await writeWikiPageWithSideEffects({
      slug,
      title: slug,
      content,
      summary: "A test page",
      logOp: "ingest",
      crossRefSource: null,
    });
  }

  it("updates confidence without changing body", async () => {
    await seedPage("patch-conf");

    const res = await callPatch("patch-conf", {
      metadata: { confidence: 0.9 },
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("patch-conf");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.confidence).toBe(0.9);
    // Body should be unchanged
    expect(page!.body).toContain("Original content.");
    // Other metadata preserved
    expect(page!.frontmatter.authors).toEqual(["original-author"]);
    expect(page!.frontmatter.expiry).toBe("2099-01-01");
  });

  it("adds tags to existing page", async () => {
    await seedPage("patch-tags");

    const res = await callPatch("patch-tags", {
      metadata: { tags: ["rust"] },
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("patch-tags");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.tags).toEqual(["rust"]);
  });

  it("bumps updated timestamp on metadata change", async () => {
    await seedPage("patch-updated");

    const res = await callPatch("patch-updated", {
      metadata: { disputed: true },
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("patch-updated");
    expect(page).not.toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    expect(page!.frontmatter.updated).toBe(today);
  });

  it("rejects lifecycle-managed field: created", async () => {
    await seedPage("patch-reject-created");

    const res = await callPatch("patch-reject-created", {
      metadata: { created: "2020-01-01" },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("created");
  });

  it("rejects lifecycle-managed field: sources", async () => {
    await seedPage("patch-reject-sources");

    const res = await callPatch("patch-reject-sources", {
      metadata: { sources: ["http://example.com"] },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("sources");
  });

  it("rejects lifecycle-managed field: authors", async () => {
    await seedPage("patch-reject-authors");

    const res = await callPatch("patch-reject-authors", {
      metadata: { authors: ["hacker"] },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("authors");
  });

  it("returns 404 for missing page", async () => {
    const res = await callPatch("nonexistent-page-xyz", {
      metadata: { confidence: 0.9 },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when metadata is missing", async () => {
    await seedPage("patch-no-meta");

    const res = await callPatch("patch-no-meta", { foo: "bar" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when metadata is not an object", async () => {
    await seedPage("patch-bad-meta");

    const res = await callPatch("patch-bad-meta", { metadata: "not-object" });
    expect(res.status).toBe(400);
  });

  it("appends author to contributors", async () => {
    await seedPage("patch-contrib", { contributors: ["alice"] });

    const res = await callPatch("patch-contrib", {
      metadata: { confidence: 0.8 },
      author: "bob", // ignored — session principal is used
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("patch-contrib");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.contributors).toEqual(["alice", "test-user"]);
  });

  it("updates multiple metadata fields at once", async () => {
    await seedPage("patch-multi");

    const res = await callPatch("patch-multi", {
      metadata: {
        confidence: 0.95,
        disputed: true,
        aliases: ["multi-alias"],
        supersedes: "old-page",
      },
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("patch-multi");
    expect(page).not.toBeNull();
    const fm = page!.frontmatter;
    expect(fm.confidence).toBe(0.95);
    expect(fm.disputed).toBe(true);
    expect(fm.aliases).toEqual(["multi-alias"]);
    expect(fm.supersedes).toBe("old-page");
  });

  it("clears a field when null is sent", async () => {
    await seedPage("patch-clear", {
      confidence: 0.7,
      expiry: "2099-06-01",
      supersedes: "old-slug",
    });

    const res = await callPatch("patch-clear", {
      metadata: { confidence: null, expiry: null, supersedes: null },
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("patch-clear");
    expect(page).not.toBeNull();
    // null values should remove the key from frontmatter
    expect(page!.frontmatter.confidence).toBeUndefined();
    expect(page!.frontmatter.expiry).toBeUndefined();
    expect(page!.frontmatter.supersedes).toBeUndefined();
    // Other fields preserved
    expect(page!.frontmatter.authors).toEqual(["original-author"]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/wiki — agent-identity filtering
// ---------------------------------------------------------------------------

describe("GET /api/wiki — agent-identity filtering", () => {
  async function seedPage(slug: string, fm: Frontmatter = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const defaults: Frontmatter = {
      created: today,
      confidence: 0.5,
      authors: ["test-user"],
      contributors: [],
      expiry: "2099-01-01",
      sources: [],
      ...fm,
    };
    const content = serializeFrontmatter(defaults, `# ${slug}\n\nSome content.`);
    await writeWikiPageWithSideEffects({
      slug,
      title: slug,
      content,
      summary: `Summary of ${slug}`,
      logOp: "ingest",
      crossRefSource: null,
    });
  }

  async function callGet(params = "") {
    const { GET } = await import("@/app/api/wiki/route");
    const req = new Request(`http://localhost:3000/api/wiki${params}`);
    return GET(req);
  }

  it("excludes agent-identity pages from default response", async () => {
    await seedPage("human-page");
    await seedPage("agent-page", { type: "agent-identity" });

    const res = await callGet();
    expect(res.status).toBe(200);

    const data = await res.json();
    const slugs = data.pages.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain("human-page");
    expect(slugs).not.toContain("agent-page");
  });

  it("includes agent-identity pages when includeAgentPages=true", async () => {
    await seedPage("human-page-b");
    await seedPage("agent-page-b", { type: "agent-identity" });

    const res = await callGet("?includeAgentPages=true");
    expect(res.status).toBe(200);

    const data = await res.json();
    const slugs = data.pages.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain("human-page-b");
    expect(slugs).toContain("agent-page-b");
  });

  it("enriches type field in index entries", async () => {
    await seedPage("typed-page", { type: "agent-identity" });

    const res = await callGet("?includeAgentPages=true");
    expect(res.status).toBe(200);

    const data = await res.json();
    const typed = data.pages.find(
      (p: { slug: string }) => p.slug === "typed-page",
    );
    expect(typed).toBeDefined();
    expect(typed.type).toBe("agent-identity");
  });

  it("does not add type field for normal pages", async () => {
    await seedPage("normal-page");

    const res = await callGet();
    expect(res.status).toBe(200);

    const data = await res.json();
    const normal = data.pages.find(
      (p: { slug: string }) => p.slug === "normal-page",
    );
    expect(normal).toBeDefined();
    expect(normal.type).toBeUndefined();
  });
});
