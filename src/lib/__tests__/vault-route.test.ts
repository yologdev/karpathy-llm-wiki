import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Default: signed in as "alice". Individual tests override (e.g. signed out).
vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "alice", handle: "alice" })),
}));

import {
  ensureDirectories,
  writeWikiPage,
  serializeFrontmatter,
  type Frontmatter,
} from "../wiki";
import { getVaultRefs, addVaultRef } from "../vault";
import { getPrincipal } from "../auth";
import { _resetStorage } from "../storage";

const mockedGetPrincipal = vi.mocked(getPrincipal);

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-route-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
  await ensureDirectories();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
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
    owner: "bob",
    visibility: "public",
    authors: ["bob"],
    contributors: [],
    tags: [],
    ...over,
  } as Frontmatter;
}

async function writePage(slug: string, over: Partial<Frontmatter> = {}) {
  await writeWikiPage(
    slug,
    serializeFrontmatter(fm(over), `# ${slug}\n\nBody for ${slug}.`),
  );
}

async function callVault(method: "POST" | "DELETE", body: unknown) {
  const mod = await import("@/app/api/vault/route");
  const handler = method === "POST" ? mod.POST : mod.DELETE;
  const req = new Request("http://localhost/api/vault", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(req);
}

describe("POST /api/vault — curate", () => {
  it("curates a public commons page into the caller's own vault", async () => {
    await writePage("transformers");

    const res = await callVault("POST", { slug: "transformers" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ curated: true, slug: "transformers" });

    // Stored under the SESSION handle (alice), not anything from the body.
    expect(await getVaultRefs("alice")).toEqual(["transformers"]);
    expect(await getVaultRefs("bob")).toEqual([]);
  });

  it("401s when signed out, without touching the vault", async () => {
    mockedGetPrincipal.mockResolvedValueOnce(null);
    await writePage("transformers");

    const res = await callVault("POST", { slug: "transformers" });
    expect(res.status).toBe(401);
    expect(await getVaultRefs("alice")).toEqual([]);
  });

  it("404s a missing page", async () => {
    const res = await callVault("POST", { slug: "does-not-exist" });
    expect(res.status).toBe(404);
  });

  it("400s a private page (not a commons page)", async () => {
    await writePage("secret", { visibility: "private", owner: "alice" });
    const res = await callVault("POST", { slug: "secret" });
    expect(res.status).toBe(400);
    expect(await getVaultRefs("alice")).toEqual([]);
  });

  it("400s an agent-scoped page", async () => {
    await writePage("agent-note", { type: "agent-knowledge" });
    const res = await callVault("POST", { slug: "agent-note" });
    expect(res.status).toBe(400);
  });

  it("400s a missing slug", async () => {
    const res = await callVault("POST", {});
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/vault — uncurate", () => {
  it("removes a curated reference", async () => {
    await addVaultRef("alice", "transformers");
    const res = await callVault("DELETE", { slug: "transformers" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ curated: false, slug: "transformers" });
    expect(await getVaultRefs("alice")).toEqual([]);
  });

  it("uncurates without requiring the page to still be a commons page", async () => {
    // Page has since gone private — removal must still work.
    await addVaultRef("alice", "was-public");
    await writePage("was-public", { visibility: "private", owner: "bob" });
    const res = await callVault("DELETE", { slug: "was-public" });
    expect(res.status).toBe(200);
    expect(await getVaultRefs("alice")).toEqual([]);
  });
});
