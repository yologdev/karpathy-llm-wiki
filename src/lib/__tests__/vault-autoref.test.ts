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
import { getVaultRefs, listVaults } from "../vault";
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

// In the multi-vault model membership is EXPLICIT: writing/ingesting a page no
// longer auto-joins any vault (the old lifecycle "auto-ref" step was removed).
// Pages join a vault only via ingest-into-vault / curate-into-vault.
describe("no vault auto-membership on write (auto-ref removed)", () => {
  it("does NOT add an owner's new public commons page to any vault", async () => {
    await write("transformers", { owner: "alice" });
    expect(await getVaultRefs("alice")).toEqual([]); // legacy single-vault store
    expect(await listVaults("alice")).toEqual([]); // no named vaults either
  });

  it("leaves the vault empty across re-writes", async () => {
    await write("transformers", { owner: "alice" });
    await write("transformers", { owner: "alice" });
    expect(await getVaultRefs("alice")).toEqual([]);
    expect(await listVaults("alice")).toEqual([]);
  });
});
