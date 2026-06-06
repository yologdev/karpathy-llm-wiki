import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getOwnerIndex,
  syncOwnerIndexForPage,
  removeOwnerIndexForSlug,
  rebuildOwnerIndex,
} from "../owner-index";
import { slugsForOwner } from "../search";
import { ensureDirectories, writeWikiPage } from "../wiki";
import { _resetLocks } from "../lock";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "owner-index-test-"));
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

/** Create a page with frontmatter + register it in index.md. */
async function createPage(slug: string, frontmatter: string, title = slug) {
  await ensureDirectories();
  await writeWikiPage(slug, `---\n${frontmatter}\n---\n\n# ${title}\n\nBody.`);
  const indexPath = path.join(process.env.WIKI_DIR!, "index.md");
  let existing = "";
  try {
    existing = await fs.readFile(indexPath, "utf-8");
  } catch { /* none */ }
  const line = `- [${title}](${slug}.md) — ${title}`;
  await fs.writeFile(
    indexPath,
    existing ? `${existing.trimEnd()}\n${line}\n` : `# Wiki Index\n\n${line}\n`,
    "utf-8",
  );
}

describe("syncOwnerIndexForPage", () => {
  it("adds the slug to the owner tenant bucket", async () => {
    await syncOwnerIndexForPage("p", "alice");
    expect((await getOwnerIndex()).alice).toEqual(["p"]);
  });

  it("adds the slug to owner AND every contributor tenant", async () => {
    await syncOwnerIndexForPage("p", "alice", ["bob", "Carol"]);
    const idx = await getOwnerIndex();
    expect(idx.alice).toEqual(["p"]);
    expect(idx.bob).toEqual(["p"]);
    expect(idx.carol).toEqual(["p"]); // tenant is lowercased
  });

  it("ownerless pages land in the default (yopedia) tenant", async () => {
    await syncOwnerIndexForPage("o");
    expect((await getOwnerIndex()).yopedia).toEqual(["o"]);
  });

  it("removes the slug from a stale bucket when owner/contributors change", async () => {
    await syncOwnerIndexForPage("p", "alice", ["bob"]);
    expect((await getOwnerIndex()).bob).toEqual(["p"]);
    // bob no longer a contributor → drop from bob's bucket.
    await syncOwnerIndexForPage("p", "alice", []);
    const idx = await getOwnerIndex();
    expect(idx.alice).toEqual(["p"]);
    expect(idx.bob).toBeUndefined();
  });

  it("is idempotent (no duplicate slugs)", async () => {
    await syncOwnerIndexForPage("p", "alice");
    await syncOwnerIndexForPage("p", "alice");
    expect((await getOwnerIndex()).alice).toEqual(["p"]);
  });
});

describe("removeOwnerIndexForSlug", () => {
  it("removes the slug from all buckets", async () => {
    await syncOwnerIndexForPage("p", "alice", ["bob"]);
    await removeOwnerIndexForSlug("p");
    expect(await getOwnerIndex()).toEqual({});
  });
});

describe("rebuildOwnerIndex", () => {
  it("builds all buckets in one pass over frontmatter", async () => {
    await createPage("a", "owner: alice");
    await createPage("b", "owner: bob\ncontributors: [alice]");
    await createPage("c", ""); // ownerless → yopedia
    await rebuildOwnerIndex();
    const idx = await getOwnerIndex();
    expect(idx.alice.sort()).toEqual(["a", "b"]);
    expect(idx.bob).toEqual(["b"]);
    expect(idx.yopedia).toEqual(["c"]);
  });
});

describe("slugsForOwner read parity (fast path vs fallback)", () => {
  it("empty index → falls back to scan, same result as populated fast path", async () => {
    await createPage("a", "owner: alice");
    await createPage("b", "owner: bob\ncontributors: [alice]");

    // No index yet → fallback scan.
    expect(await getOwnerIndex()).toEqual({});
    const fallback = (await slugsForOwner("alice")).sort();
    expect(fallback).toEqual(["a", "b"]);

    // Populate the index → fast path → SAME result.
    await rebuildOwnerIndex();
    expect(Object.keys(await getOwnerIndex()).length).toBeGreaterThan(0);
    const fastPath = (await slugsForOwner("alice")).sort();
    expect(fastPath).toEqual(fallback);
  });
});
