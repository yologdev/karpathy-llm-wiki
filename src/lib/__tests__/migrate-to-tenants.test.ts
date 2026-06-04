import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { migrateToTenants, getRedirectMap } from "../migrate-to-tenants";
import { getCommonsIndex } from "../commons";
import { ensureDirectories, writeWikiPage } from "../wiki";
import { _resetStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-test-"));
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

async function createPage(slug: string, frontmatter: string, title: string) {
  await ensureDirectories();
  await writeWikiPage(slug, `---\n${frontmatter}\n---\n\n# ${title}\n\nBody of ${title}.`);
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

const exists = async (rel: string) =>
  fs.access(path.join(tmpDir, rel)).then(() => true).catch(() => false);

async function seedThreePages() {
  await createPage("pub", "owner: alice\nvisibility: public", "Public");
  await createPage("priv", "owner: bob\nvisibility: private", "Private");
  await createPage("seed", "# no owner here", "Seed"); // ownerless
}

describe("migrateToTenants — dry run", () => {
  it("reports the plan without writing anything", async () => {
    await seedThreePages();
    const r = await migrateToTenants({ dryRun: true });

    expect(r.dryRun).toBe(true);
    expect(r.totalPages).toBe(3);
    expect(r.tenants).toEqual({ alice: 1, bob: 1, system: 1 });
    expect(r.redirectCount).toBe(3);
    expect(r.artifactsCopied).toBe(0);
    expect(r.errors).toEqual([]);

    // Nothing written to tenant folders, no redirect map persisted.
    expect(await exists("tenants/alice/wiki/pub.md")).toBe(false);
    expect(await getRedirectMap()).toEqual([]);
  });

  it("dry run is the default (must opt in to write)", async () => {
    await seedThreePages();
    const r = await migrateToTenants();
    expect(r.dryRun).toBe(true);
    expect(await exists("tenants/alice/wiki/pub.md")).toBe(false);
  });
});

describe("migrateToTenants — live", () => {
  it("copies pages into tenant silos, builds per-tenant indexes + commons + redirect map", async () => {
    await seedThreePages();
    const r = await migrateToTenants({ dryRun: false });

    expect(r.dryRun).toBe(false);
    expect(r.totalPages).toBe(3);
    expect(r.errors).toEqual([]);

    // Pages copied into their owner's silo (ownerless → system).
    expect(await exists("tenants/alice/wiki/pub.md")).toBe(true);
    expect(await exists("tenants/bob/wiki/priv.md")).toBe(true);
    expect(await exists("tenants/system/wiki/seed.md")).toBe(true);

    // Flat originals are untouched (copy, not move).
    expect(await exists("wiki/pub.md")).toBe(true);

    // Per-tenant index.md written.
    const aliceIndex = await fs.readFile(
      path.join(tmpDir, "tenants/alice/wiki/index.md"),
      "utf-8",
    );
    expect(aliceIndex).toContain("(pub.md)");

    // Commons holds the public pages (pub + the ownerless seed); the private
    // "priv" is excluded.
    const commons = await getCommonsIndex();
    expect(commons.map((e) => e.slug).sort()).toEqual(["pub", "seed"]);
    expect(commons.find((e) => e.slug === "pub")?.tenant).toBe("alice");
    expect(commons.find((e) => e.slug === "seed")?.tenant).toBe("system");

    // Redirect map persisted, old → new.
    const map = await getRedirectMap();
    expect(map).toContainEqual({ from: "/wiki/pub", to: "/u/alice/pub" });
    expect(map).toContainEqual({ from: "/wiki/seed", to: "/u/system/seed" });
  });

  it("is idempotent (re-running overwrites, same result)", async () => {
    await seedThreePages();
    await migrateToTenants({ dryRun: false });
    const r2 = await migrateToTenants({ dryRun: false });
    expect(r2.errors).toEqual([]);
    expect(await exists("tenants/alice/wiki/pub.md")).toBe(true);
  });

  it("normalizes the tenant from the owner handle (case-insensitive)", async () => {
    await createPage("p", "owner: Alice\nvisibility: public", "P");
    const r = await migrateToTenants({ dryRun: false });
    expect(r.tenants).toEqual({ alice: 1 });
    expect(await exists("tenants/alice/wiki/p.md")).toBe(true);
  });
});
