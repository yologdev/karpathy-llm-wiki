import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  vaultIdFor,
  vaultOwnedBy,
  createVault,
  listVaults,
  getVault,
  vaultSlugs,
  vaultsContaining,
  addToVault,
  removeFromVault,
  renameVault,
  deleteVault,
} from "../vault";
import { _resetStorage } from "../storage";
import { _resetLocks } from "../lock";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-multi-test-"));
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

describe("multi-vault model", () => {
  it("vaultIdFor encodes the owner tenant as the `--` prefix", () => {
    expect(vaultIdFor("Alice", "Reading List")).toBe("alice--reading-list");
    expect(vaultOwnedBy("alice--reading-list", "alice")).toBe(true);
    expect(vaultOwnedBy("alice--reading-list", "bob")).toBe(false);
  });

  it("creates, lists, and reads a vault (public by default, empty)", async () => {
    const v = await createVault("alice", "Reading List");
    expect(v).toMatchObject({
      id: "alice--reading-list",
      owner: "alice",
      name: "Reading List",
      visibility: "public",
      slugs: [],
    });
    expect(await listVaults("alice")).toHaveLength(1);
    expect(await getVault("alice--reading-list")).toMatchObject({ name: "Reading List" });
    expect(await getVault("alice--nope")).toBeNull();
  });

  it("create is idempotent on (owner, name)", async () => {
    const a = await createVault("alice", "ML");
    const b = await createVault("alice", "ML");
    expect(b.id).toBe(a.id);
    expect(await listVaults("alice")).toHaveLength(1);
  });

  it("adds/removes page refs (idempotent) and reports membership", async () => {
    const v = await createVault("alice", "ML");
    await addToVault(v.id, "transformers");
    await addToVault(v.id, "transformers"); // idempotent
    await addToVault(v.id, "attention");
    expect(await vaultSlugs(v.id)).toEqual(["transformers", "attention"]);
    expect(await vaultsContaining("alice", "transformers")).toEqual([v.id]);

    await removeFromVault(v.id, "transformers");
    expect(await vaultSlugs(v.id)).toEqual(["attention"]);
    expect(await vaultsContaining("alice", "transformers")).toEqual([]);
  });

  it("renames (id stays stable) and deletes", async () => {
    const v = await createVault("alice", "ML");
    await addToVault(v.id, "x");
    await renameVault(v.id, "Machine Learning");
    expect((await getVault(v.id))?.name).toBe("Machine Learning");
    expect((await getVault(v.id))?.slugs).toEqual(["x"]); // members preserved

    await deleteVault(v.id);
    expect(await getVault(v.id)).toBeNull();
    expect(await listVaults("alice")).toEqual([]);
  });

  it("vaults are owner-scoped (different owners don't collide)", async () => {
    await createVault("alice", "ML");
    await createVault("bob", "ML");
    expect(await listVaults("alice")).toHaveLength(1);
    expect(await listVaults("bob")).toHaveLength(1);
    expect((await listVaults("alice"))[0].id).toBe("alice--ml");
    expect((await listVaults("bob"))[0].id).toBe("bob--ml");
  });
});
