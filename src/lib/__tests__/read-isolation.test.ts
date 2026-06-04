import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ensureDirectories, writeWikiPage, listReadableWikiPages } from "../wiki";
import { _resetStorage } from "../storage";

let tmpDir: string;
let prevWiki: string | undefined;
let prevRaw: string | undefined;
let prevData: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "read-iso-"));
  prevWiki = process.env.WIKI_DIR;
  prevRaw = process.env.RAW_DIR;
  prevData = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
});

afterEach(async () => {
  process.env.WIKI_DIR = prevWiki;
  process.env.RAW_DIR = prevRaw;
  process.env.DATA_DIR = prevData;
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Write a page with frontmatter and register it in the index. */
async function createPage(slug: string, frontmatter: string, title: string) {
  await ensureDirectories();
  await writeWikiPage(slug, `---\n${frontmatter}\n---\n\n# ${title}\n\nBody.`);
  const indexPath = path.join(process.env.WIKI_DIR!, "index.md");
  let existing = "";
  try {
    existing = await fs.readFile(indexPath, "utf-8");
  } catch {
    /* none yet */
  }
  const line = `- [${title}](${slug}.md) — ${title}`;
  const next = existing
    ? `${existing.trimEnd()}\n${line}\n`
    : `# Wiki Index\n\n${line}\n`;
  await fs.writeFile(indexPath, next, "utf-8");
}

describe("listReadableWikiPages — read isolation", () => {
  beforeEach(async () => {
    await createPage("pub", "owner: alice\nvisibility: public", "Public Page");
    await createPage("priv", "owner: alice\nvisibility: private", "Alice Private");
    await createPage(
      "agent-priv",
      "owner: alice--yoyo\nvisibility: private\ntype: agent-knowledge",
      "Agent Private",
    );
  });

  it("hides private pages from anonymous readers", async () => {
    const slugs = (await listReadableWikiPages(null)).map((p) => p.slug);
    expect(slugs).toContain("pub");
    expect(slugs).not.toContain("priv");
    expect(slugs).not.toContain("agent-priv");
  });

  it("hides another user's private pages", async () => {
    const slugs = (await listReadableWikiPages({ id: "u2", handle: "bob" })).map(
      (p) => p.slug,
    );
    expect(slugs).toContain("pub");
    expect(slugs).not.toContain("priv");
    expect(slugs).not.toContain("agent-priv");
  });

  it("shows the owner their own private pages, incl. their agent's", async () => {
    const slugs = (
      await listReadableWikiPages({ id: "u1", handle: "alice" })
    ).map((p) => p.slug);
    expect(slugs).toContain("pub");
    expect(slugs).toContain("priv");
    expect(slugs).toContain("agent-priv"); // alice--yoyo → human owner alice
  });
});
