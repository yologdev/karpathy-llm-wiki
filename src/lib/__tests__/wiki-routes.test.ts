import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
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
    expect(fm.authors).toEqual(["anonymous"]);
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

  it("uses provided author instead of anonymous", async () => {
    const res = await callPost({
      slug: "authored-page",
      content: "# Authored\n\nBy someone.",
      author: "alice",
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("authored-page");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.authors).toEqual(["alice"]);
  });

  it("ignores empty author string and falls back to anonymous", async () => {
    const res = await callPost({
      slug: "empty-author",
      content: "# Empty Author\n\nContent.",
      author: "   ",
    });
    expect(res.status).toBe(201);

    const page = await readWikiPageWithFrontmatter("empty-author");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.authors).toEqual(["anonymous"]);
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

  it("appends author to contributors on edit", async () => {
    await seedPage("contrib-test");

    const res = await callPut("contrib-test", {
      content: "# Contrib Test\n\nEdited.",
      author: "editor-bob",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("contrib-test");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.contributors).toEqual(["editor-bob"]);
  });

  it("does not duplicate contributors on repeated edits", async () => {
    await seedPage("no-dup-test");

    // First edit
    await callPut("no-dup-test", {
      content: "# No Dup Test\n\nFirst edit.",
      author: "editor-alice",
    });

    // Second edit by the same person
    const res = await callPut("no-dup-test", {
      content: "# No Dup Test\n\nSecond edit.",
      author: "editor-alice",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("no-dup-test");
    expect(page).not.toBeNull();

    const contributors = page!.frontmatter.contributors as string[];
    expect(contributors.filter((c) => c === "editor-alice")).toHaveLength(1);
  });

  it("preserves existing contributors when adding new one", async () => {
    await seedPage("multi-contrib", { contributors: ["first-editor"] });

    const res = await callPut("multi-contrib", {
      content: "# Multi Contrib\n\nAnother edit.",
      author: "second-editor",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("multi-contrib");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.contributors).toEqual([
      "first-editor",
      "second-editor",
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

  it("does not add to contributors when no author provided", async () => {
    await seedPage("no-author-edit", { contributors: ["existing"] });

    const res = await callPut("no-author-edit", {
      content: "# No Author Edit\n\nAnonymous edit.",
    });
    expect(res.status).toBe(200);

    const page = await readWikiPageWithFrontmatter("no-author-edit");
    expect(page).not.toBeNull();
    // contributors should remain unchanged
    expect(page!.frontmatter.contributors).toEqual(["existing"]);
  });
});
