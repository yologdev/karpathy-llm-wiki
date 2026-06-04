import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { patchMetadata, PATCHABLE_KEYS } from "../patch-metadata";
import { ensureDirectories, writeWikiPage } from "../wiki";
import { serializeFrontmatter } from "../frontmatter";
import { resetAliasIndex } from "../alias-index";

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "patch-meta-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  await ensureDirectories();
});

afterEach(async () => {
  if (originalWikiDir === undefined) {
    delete process.env.WIKI_DIR;
  } else {
    process.env.WIKI_DIR = originalWikiDir;
  }
  if (originalRawDir === undefined) {
    delete process.env.RAW_DIR;
  } else {
    process.env.RAW_DIR = originalRawDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  resetAliasIndex();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedPage(slug: string): Promise<void> {
  const content = serializeFrontmatter(
    {
      title: "Test Page",
      created: "2025-01-01",
      updated: "2025-01-01",
      confidence: 0.5,
      visibility: "public",
      authors: ["tester"],
    },
    "# Test Page\n\nSome content.\n",
  );
  await writeWikiPage(slug, content);
}

// ===========================================================================
// visibility guard
// ===========================================================================

describe("patchMetadata — visibility guard", () => {
  it("rejects setting visibility: private without a paid plan (PLAN_REQUIRED)", async () => {
    await seedPage("guarded-page");
    try {
      // No principal → not entitled → the paid gate fires before the owner check.
      await patchMetadata({
        slug: "guarded-page",
        metadata: { visibility: "private" },
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      expect(e.code).toBe("PLAN_REQUIRED");
      expect(e.message.toLowerCase()).toContain("paid plan");
    }
  });

  it("allows visibility: public", async () => {
    await seedPage("public-page");
    const result = await patchMetadata({
      slug: "public-page",
      metadata: { visibility: "public" },
    });
    expect(result.updated).toBe(true);
    expect(result.slug).toBe("public-page");
  });

  it("includes visibility in PATCHABLE_KEYS", () => {
    expect(PATCHABLE_KEYS.has("visibility")).toBe(true);
  });

  it("still rejects lifecycle keys alongside private visibility", async () => {
    await seedPage("combo-page");
    // lifecycle rejection fires before visibility guard
    try {
      await patchMetadata({
        slug: "combo-page",
        metadata: { created: "2025-06-01", visibility: "private" },
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      expect(e.code).toBe("LIFECYCLE_FIELD");
    }
  });
});
