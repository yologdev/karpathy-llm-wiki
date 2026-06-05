import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getVaultRefs,
  addVaultRef,
  removeVaultRef,
  isInVault,
} from "../vault";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-test-"));
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

describe("vault refs", () => {
  it("returns an empty list for a handle with no vault", async () => {
    expect(await getVaultRefs("alice")).toEqual([]);
    expect(await isInVault("alice", "transformers")).toBe(false);
  });

  it("adds and reads back curated slugs (insertion order)", async () => {
    await addVaultRef("alice", "transformers");
    await addVaultRef("alice", "rag");
    expect(await getVaultRefs("alice")).toEqual(["transformers", "rag"]);
    expect(await isInVault("alice", "rag")).toBe(true);
  });

  it("is idempotent — a duplicate add does not double-list", async () => {
    await addVaultRef("alice", "transformers");
    await addVaultRef("alice", "transformers");
    expect(await getVaultRefs("alice")).toEqual(["transformers"]);
  });

  it("removes a slug (no-op when absent)", async () => {
    await addVaultRef("alice", "transformers");
    await addVaultRef("alice", "rag");
    await removeVaultRef("alice", "transformers");
    expect(await getVaultRefs("alice")).toEqual(["rag"]);
    // Removing something not present is a no-op.
    await removeVaultRef("alice", "not-there");
    expect(await getVaultRefs("alice")).toEqual(["rag"]);
  });

  it("keeps each handle's vault separate", async () => {
    await addVaultRef("alice", "transformers");
    await addVaultRef("bob", "rag");
    expect(await getVaultRefs("alice")).toEqual(["transformers"]);
    expect(await getVaultRefs("bob")).toEqual(["rag"]);
  });

  it("keys by normalized handle (case-insensitive, same as the tenant)", async () => {
    await addVaultRef("Alice", "transformers");
    // A differently-cased handle resolves to the same vault (tenant key).
    expect(await getVaultRefs("alice")).toEqual(["transformers"]);
    expect(await isInVault("ALICE", "transformers")).toBe(true);
  });
});
