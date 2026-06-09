import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  belongsInCommons,
  getCommonsIndex,
  upsertCommonsEntry,
  syncCommonsForPage,
  removeCommonsEntryBySlug,
  rebuildCommonsIndex,
  listCommonsPages,
} from "../commons";
import { ensureDirectories, writeWikiPage } from "../wiki";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "commons-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
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

describe("belongsInCommons", () => {
  it("public non-agent pages belong; private + agent-scoped do not", () => {
    expect(belongsInCommons({})).toBe(true);
    expect(belongsInCommons({ visibility: "public" })).toBe(true);
    expect(belongsInCommons({ visibility: "private" })).toBe(false);
    expect(belongsInCommons({ type: "agent-knowledge" })).toBe(false);
    expect(belongsInCommons({ type: "agent-identity" })).toBe(false);
    expect(belongsInCommons({ type: "wiki" })).toBe(true);
  });

  it("excludes saved HTML artifacts (personal rendered outputs)", () => {
    expect(belongsInCommons({ type: "html" })).toBe(false);
  });
});

describe("syncCommonsForPage", () => {
  it("adds a public page keyed by its owner tenant", async () => {
    await syncCommonsForPage("p", {
      owner: "alice",
      visibility: "public",
      title: "P",
      summary: "s",
    });
    const idx = await getCommonsIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0]).toMatchObject({ tenant: "alice", slug: "p", title: "P" });
  });

  it("ownerless pages land in the default (yopedia) tenant", async () => {
    await syncCommonsForPage("o", { title: "O", summary: "" });
    const idx = await getCommonsIndex();
    expect(idx[0]).toMatchObject({ tenant: "yopedia", slug: "o" });
  });

  it("private pages are excluded (and removed if previously public)", async () => {
    await syncCommonsForPage("x", { owner: "alice", visibility: "public", title: "X", summary: "" });
    expect(await getCommonsIndex()).toHaveLength(1);
    await syncCommonsForPage("x", { owner: "alice", visibility: "private", title: "X", summary: "" });
    expect(await getCommonsIndex()).toHaveLength(0);
  });

  it("upsert updates in place (no duplicate)", async () => {
    await syncCommonsForPage("p", { owner: "alice", title: "P", summary: "a" });
    await syncCommonsForPage("p", { owner: "alice", title: "P2", summary: "b" });
    const idx = await getCommonsIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0].title).toBe("P2");
  });
});

describe("entry keying is (tenant, slug)", () => {
  it("the same slug under two tenants is two distinct rows", async () => {
    await upsertCommonsEntry({ tenant: "alice", slug: "p", title: "A", summary: "" });
    await upsertCommonsEntry({ tenant: "bob", slug: "p", title: "B", summary: "" });
    const idx = await getCommonsIndex();
    expect(idx).toHaveLength(2);
    expect(idx.map((e) => e.tenant).sort()).toEqual(["alice", "bob"]);
  });
});

describe("removeCommonsEntryBySlug", () => {
  it("removes an entry regardless of which tenant owns it", async () => {
    // caller doesn't know the tenant; the entry belongs to bob
    await upsertCommonsEntry({ tenant: "bob", slug: "p", title: "P", summary: "" });
    await removeCommonsEntryBySlug("p");
    expect(await getCommonsIndex()).toHaveLength(0);
    // no-op when absent
    await removeCommonsEntryBySlug("nope");
  });
});

describe("rebuildCommonsIndex", () => {
  async function createPage(slug: string, frontmatter: string, title: string) {
    await ensureDirectories();
    await writeWikiPage(slug, `---\n${frontmatter}\n---\n\n# ${title}\n\nBody.`);
    const indexPath = path.join(process.env.WIKI_DIR!, "index.md");
    let existing = "";
    try {
      existing = await fs.readFile(indexPath, "utf-8");
    } catch {
      /* none */
    }
    const line = `- [${title}](${slug}.md) — ${title}`;
    await fs.writeFile(
      indexPath,
      existing ? `${existing.trimEnd()}\n${line}\n` : `# Wiki Index\n\n${line}\n`,
      "utf-8",
    );
  }

  it("indexes public pages only (excludes private + agent)", async () => {
    await createPage("pub", "owner: alice\nvisibility: public", "Public");
    await createPage("priv", "owner: alice\nvisibility: private", "Private");
    await createPage("ag", "owner: alice--yoyo\ntype: agent-knowledge", "Agent");

    const count = await rebuildCommonsIndex();
    const idx = await getCommonsIndex();
    const slugs = idx.map((e) => e.slug).sort();
    expect(count).toBe(1);
    expect(slugs).toEqual(["pub"]);
    expect(idx[0].tenant).toBe("alice");
  });

  it("listCommonsPages reads the index (owner = tenant) when populated", async () => {
    await syncCommonsForPage("p", { owner: "alice", title: "P", summary: "s", tags: ["x"] });
    await syncCommonsForPage("q", { owner: "bob", title: "Q", summary: "t" });
    const pages = await listCommonsPages();
    expect(pages.map((p) => p.slug).sort()).toEqual(["p", "q"]);
    const p = pages.find((e) => e.slug === "p")!;
    expect(p.owner).toBe("alice");
    expect(p.title).toBe("P");
    expect(p.tags).toEqual(["x"]);
  });

  it("listCommonsPages preserves the original-case owner handle (tenant stays lowercased)", async () => {
    await syncCommonsForPage("p", { owner: "Alice", title: "P", summary: "s" });
    const idx = await getCommonsIndex();
    // The storage key (tenant) is normalized to lowercase...
    expect(idx[0].tenant).toBe("alice");
    expect(idx[0].owner).toBe("Alice");
    // ...but the displayed owner keeps the original case.
    const pages = await listCommonsPages();
    expect(pages.find((e) => e.slug === "p")!.owner).toBe("Alice");
  });

  it("listCommonsPages falls back to the flat public set when the index is empty", async () => {
    await createPage("pub", "owner: alice\nvisibility: public", "Public");
    await createPage("priv", "owner: alice\nvisibility: private", "Private");
    await createPage("ag", "owner: alice--yoyo\ntype: agent-knowledge", "Agent");
    // No rebuild / sync → commons index is empty → derive from the flat index.
    expect(await getCommonsIndex()).toEqual([]);
    const pages = await listCommonsPages();
    expect(pages.map((p) => p.slug).sort()).toEqual(["pub"]);
  });
});
