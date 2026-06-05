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
import { getVaultRefs } from "../vault";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-autoref-test-"));
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

function fm(over: Partial<Frontmatter> = {}): Frontmatter {
  return {
    owner: "alice",
    visibility: "public",
    authors: ["alice"],
    contributors: [],
    tags: [],
    ...over,
  } as Frontmatter;
}

async function write(slug: string, over: Partial<Frontmatter> = {}) {
  await writeWikiPageWithSideEffects({
    slug,
    title: slug,
    content: serializeFrontmatter(fm(over), `# ${slug}\n\nBody for ${slug}.`),
    summary: `Summary for ${slug}.`,
    logOp: "ingest",
  });
}

describe("vault auto-ref on commons write (lifecycle step 3d)", () => {
  it("adds an owner's new public commons page to their vault", async () => {
    await write("transformers", { owner: "alice" });
    expect(await getVaultRefs("alice")).toContain("transformers");
  });

  it("is idempotent across re-writes", async () => {
    await write("transformers", { owner: "alice" });
    await write("transformers", { owner: "alice" });
    expect(await getVaultRefs("alice")).toEqual(["transformers"]);
  });

  it("does NOT auto-ref a private page", async () => {
    await write("secret", { owner: "alice", visibility: "private" });
    expect(await getVaultRefs("alice")).toEqual([]);
  });

  it("does NOT auto-ref an agent-scoped page", async () => {
    await write("agent-note", { owner: "alice", type: "agent-knowledge" });
    expect(await getVaultRefs("alice")).toEqual([]);
  });

  it("does NOT auto-ref a system-owned (seed) page", async () => {
    await write("seed-page", { owner: "system" });
    expect(await getVaultRefs("system")).toEqual([]);
  });

  it("does NOT auto-ref an agent-owned (handle--name) page", async () => {
    await write("learned", { owner: "alice--yoyo" });
    expect(await getVaultRefs("alice--yoyo")).toEqual([]);
    expect(await getVaultRefs("alice")).toEqual([]);
  });
});
