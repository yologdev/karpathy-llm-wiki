import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { syncSiloForPage, removeSiloForPage } from "../silo";
import { writeWikiPage, ensureDirectories } from "../wiki";
import { getStorage, _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "silo-test-"));
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

describe("syncSiloForPage", () => {
  it("mirrors the page md into tenants/<tenant>/wiki", async () => {
    await writeWikiPage("alpha", "# Alpha\n\nBody.");
    const n = await syncSiloForPage("alpha", "alice");
    expect(n).toBe(1); // just the wiki md (no raw/revisions/discuss/assets)
    expect(await getStorage().readFile("tenants/alice/wiki/alpha.md")).toContain(
      "# Alpha",
    );
  });

  it("re-copies the mutable md but SKIPS already-mirrored immutable revisions", async () => {
    await writeWikiPage("beta", "# Beta\n\nv1");
    // Plant two immutable revision files (as saveRevision would).
    await getStorage().writeFile("wiki/.revisions/beta/1.md", "# Beta\n\nv0");
    await getStorage().writeFile(
      "wiki/.revisions/beta/1.meta.json",
      '{"author":"a"}',
    );

    // First sync copies md + both revision files.
    expect(await syncSiloForPage("beta", "bob")).toBe(3);

    // Second sync (no new revisions) copies ONLY the mutable md again — the two
    // already-mirrored revisions are skipped (the O(N) re-copy fix).
    expect(await syncSiloForPage("beta", "bob")).toBe(1);

    // A newly-added revision IS picked up next sync.
    await getStorage().writeFile("wiki/.revisions/beta/2.md", "# Beta\n\nv1");
    expect(await syncSiloForPage("beta", "bob")).toBe(2); // md + the new revision
  });

  it("removeSiloForPage clears the page from its silo", async () => {
    await writeWikiPage("gamma", "# Gamma");
    await syncSiloForPage("gamma", "alice");
    expect(await getStorage().fileExists("tenants/alice/wiki/gamma.md")).toBe(
      true,
    );
    await removeSiloForPage("gamma", "alice");
    expect(await getStorage().fileExists("tenants/alice/wiki/gamma.md")).toBe(
      false,
    );
  });
});
