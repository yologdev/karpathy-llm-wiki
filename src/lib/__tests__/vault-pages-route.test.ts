import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// The vault is owned by the signed-in caller; mock only auth + vault membership
// so the test exercises the real ELIGIBILITY gate (isVaultEligible via real
// commons) against real pages on fs storage.
vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "u1", handle: "alice" })),
}));
vi.mock("@/lib/vault", () => ({
  vaultOwnedBy: vi.fn(() => true),
  addToVault: vi.fn(async () => {}),
  removeFromVault: vi.fn(async () => {}),
  getVault: vi.fn(async () => ({ id: "v1", visibility: "public", slugs: [] })),
}));

import { POST } from "@/app/api/vaults/[id]/pages/route";
import { addToVault } from "@/lib/vault";
import { writeWikiPage, ensureDirectories, serializeFrontmatter } from "@/lib/wiki";
import { _resetStorage } from "@/lib/storage";

const mockedAdd = vi.mocked(addToVault);

function post(slug: string) {
  return POST(
    new Request("http://localhost/api/vaults/v1/pages", {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),
    { params: Promise.resolve({ id: "v1" }) },
  );
}

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
  mockedAdd.mockClear();
});

afterEach(async () => {
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("POST /api/vaults/[id]/pages — eligibility gate", () => {
  it("rejects a PRIVATE page (400) and never references it", async () => {
    await writeWikiPage(
      "secret",
      serializeFrontmatter({ visibility: "private" }, "# Secret\n\nshh"),
    );
    const res = await post("secret");
    expect(res.status).toBe(400);
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it("rejects an agent-scoped page (400)", async () => {
    await writeWikiPage(
      "ak",
      serializeFrontmatter({ type: "agent-knowledge" }, "# AK\n\nx"),
    );
    const res = await post("ak");
    expect(res.status).toBe(400);
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it("accepts a PUBLIC artifact (html) — the headline feature", async () => {
    await writeWikiPage(
      "explainer",
      serializeFrontmatter({ type: "html" }, "# Explainer\n\n<p>hi</p>"),
    );
    const res = await post("explainer");
    expect(res.status).toBe(200);
    expect(mockedAdd).toHaveBeenCalledWith("v1", "explainer");
  });

  it("accepts a plain public commons page (200)", async () => {
    await writeWikiPage("note", "# Note\n\nknowledge");
    const res = await post("note");
    expect(res.status).toBe(200);
    expect(mockedAdd).toHaveBeenCalledWith("v1", "note");
  });
});
