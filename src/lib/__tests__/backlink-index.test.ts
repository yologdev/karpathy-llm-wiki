import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getBacklinkIndex,
  syncBacklinksForPage,
  removeBacklinksForSlug,
  rebuildBacklinkIndex,
} from "../backlink-index";
import { findBacklinks } from "../search";
import { ensureDirectories, writeWikiPage } from "../wiki";
import { _resetLocks } from "../lock";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "backlink-index-test-"));
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

async function createPage(slug: string, body: string, frontmatter = "") {
  await ensureDirectories();
  const fm = frontmatter ? `---\n${frontmatter}\n---\n\n` : "";
  await writeWikiPage(slug, `${fm}# ${slug}\n\n${body}`);
  const indexPath = path.join(process.env.WIKI_DIR!, "index.md");
  let existing = "";
  try {
    existing = await fs.readFile(indexPath, "utf-8");
  } catch { /* none */ }
  const line = `- [${slug}](${slug}.md) — ${slug}`;
  await fs.writeFile(
    indexPath,
    existing ? `${existing.trimEnd()}\n${line}\n` : `# Wiki Index\n\n${line}\n`,
    "utf-8",
  );
}

/** Seed an empty-but-present index so incremental hooks apply (not no-op). */
async function seedEmptyIndex() {
  await rebuildBacklinkIndex(); // no pages → writes `{}` (present, empty)
}

describe("no-op until seeded", () => {
  it("getBacklinkIndex returns null when absent", async () => {
    expect(await getBacklinkIndex()).toBeNull();
  });

  it("syncBacklinksForPage no-ops before any rebuild (reader stays null)", async () => {
    await syncBacklinksForPage("src", "see [T](target.md)");
    expect(await getBacklinkIndex()).toBeNull(); // not fabricated from one write
  });

  it("removeBacklinksForSlug no-ops before any rebuild", async () => {
    await removeBacklinksForSlug("a");
    expect(await getBacklinkIndex()).toBeNull();
  });

  it("rebuild seeds an empty-but-present index, then incremental updates apply", async () => {
    await seedEmptyIndex();
    expect(await getBacklinkIndex()).toEqual({});
    await syncBacklinksForPage("src", "see [T](target.md)");
    expect((await getBacklinkIndex())?.target).toEqual(["src"]);
  });
});

describe("syncBacklinksForPage (after seeding)", () => {
  beforeEach(seedEmptyIndex);

  it("adds the source for each newly-linked target", async () => {
    await syncBacklinksForPage("src", "see [T](target.md) and [U](other.md)");
    const idx = await getBacklinkIndex();
    expect(idx?.target).toEqual(["src"]);
    expect(idx?.other).toEqual(["src"]);
  });

  it("diffs against previous content: removed link drops the source", async () => {
    await syncBacklinksForPage("src", "[T](target.md) [U](other.md)");
    // New content no longer links to `other`.
    await syncBacklinksForPage("src", "[T](target.md)", "[T](target.md) [U](other.md)");
    const idx = await getBacklinkIndex();
    expect(idx?.target).toEqual(["src"]);
    expect(idx?.other).toBeUndefined();
  });

  it("ignores self-links", async () => {
    await syncBacklinksForPage("src", "[me](src.md) [T](target.md)");
    const idx = await getBacklinkIndex();
    expect(idx?.src).toBeUndefined();
    expect(idx?.target).toEqual(["src"]);
  });
});

describe("removeBacklinksForSlug (after seeding)", () => {
  beforeEach(seedEmptyIndex);

  it("drops the slug as a target key and as a source everywhere", async () => {
    await syncBacklinksForPage("a", "[X](x.md)");
    await syncBacklinksForPage("b", "[A](a.md)"); // b → a
    await removeBacklinksForSlug("a");
    const idx = await getBacklinkIndex();
    expect(idx?.a).toBeUndefined(); // a removed as a target key (b→a gone)
    expect(idx?.x).toBeUndefined(); // a was x's only source → key pruned
  });
});

describe("rebuildBacklinkIndex", () => {
  it("builds the full reverse map in one pass", async () => {
    await createPage("a", "links to [B](b.md)");
    await createPage("b", "links to [C](c.md)");
    await createPage("c", "leaf");
    await rebuildBacklinkIndex();
    const idx = await getBacklinkIndex();
    expect(idx.b).toEqual(["a"]);
    expect(idx.c).toEqual(["b"]);
  });
});

describe("findBacklinks read parity (fast path vs fallback)", () => {
  it("empty index falls back to scan; populated fast path gives same set", async () => {
    await createPage("a", "links to [Target](target.md)");
    await createPage("b", "also links [Target](target.md)");
    await createPage("target", "the target");

    // No index → fallback O(pages²) scan.
    expect(await getBacklinkIndex()).toBeNull();
    const fallback = (await findBacklinks("target")).map((b) => b.slug).sort();
    expect(fallback).toEqual(["a", "b"]);

    // Populate → fast path → SAME set, titles resolved.
    await rebuildBacklinkIndex();
    const fast = await findBacklinks("target");
    expect(fast.map((b) => b.slug).sort()).toEqual(fallback);
    expect(fast.every((b) => typeof b.title === "string")).toBe(true);
  });

  it("private linkers are filtered on READ (visibility never stored in index)", async () => {
    await createPage("pub", "links [Target](target.md)", "owner: alice\nvisibility: public");
    await createPage("priv", "links [Target](target.md)", "owner: alice\nvisibility: private");
    await createPage("target", "the target");
    await rebuildBacklinkIndex();

    // The index records BOTH sources (no visibility encoded).
    const idx = await getBacklinkIndex();
    expect(idx?.target.sort()).toEqual(["priv", "pub"]);

    // But an anonymous read filters out the private linker.
    const anon = await findBacklinks("target", null);
    expect(anon.map((b) => b.slug)).toEqual(["pub"]);
  });
});
