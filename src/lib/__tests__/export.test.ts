import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { strFromU8, unzipSync } from "fflate";
import { convertToObsidianLinks, normalizeVaultAssetPaths } from "../export";
import { writeWikiPage, updateIndex, ensureDirectories, rawRelPath } from "../wiki";
import { serializeFrontmatter } from "../frontmatter";
import { getStorage, _resetStorage } from "../storage";

describe("convertToObsidianLinks", () => {
  it("converts a basic internal link", () => {
    expect(convertToObsidianLinks("[Title](slug.md)")).toBe("[[slug|Title]]");
  });

  it("does not convert external URLs", () => {
    const input = "[Google](https://google.com)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("does not convert external URLs ending in .md", () => {
    const input = "[Docs](https://example.com/readme.md)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("converts multiple links on one line", () => {
    const input = "See [Alpha](alpha.md) and [Beta](beta.md) for details.";
    expect(convertToObsidianLinks(input)).toBe(
      "See [[alpha|Alpha]] and [[beta|Beta]] for details.",
    );
  });

  it("handles slugs with hyphens", () => {
    expect(convertToObsidianLinks("[My Page](my-page.md)")).toBe(
      "[[my-page|My Page]]",
    );
  });

  it("handles single-character slugs", () => {
    expect(convertToObsidianLinks("[X](x.md)")).toBe("[[x|X]]");
  });

  it("does not convert image embeds", () => {
    const input = "![diagram](arch.md)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("leaves non-.md internal links alone", () => {
    const input = "[File](data.json)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("preserves YAML frontmatter", () => {
    const input = `---
title: Test
tags: [ai, ml]
---

# Test

See [Related](related.md).`;
    const expected = `---
title: Test
tags: [ai, ml]
---

# Test

See [[related|Related]].`;
    expect(convertToObsidianLinks(input)).toBe(expected);
  });
});

describe("normalizeVaultAssetPaths", () => {
  it("rewrites raw/assets image refs to vault-relative assets/", () => {
    expect(
      normalizeVaultAssetPaths("![x](raw/assets/p/img.png)"),
    ).toBe("![x](assets/p/img.png)");
  });
  it("leaves already-vault-relative and absolute refs untouched", () => {
    expect(normalizeVaultAssetPaths("![x](assets/p/img.png)")).toBe(
      "![x](assets/p/img.png)",
    );
    expect(normalizeVaultAssetPaths("![x](https://e.com/i.png)")).toBe(
      "![x](https://e.com/i.png)",
    );
  });
});

describe("GET /api/wiki/export — scoped vault", () => {
  let tmpDir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "export-test-"));
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

  async function exportZip(scope?: string): Promise<Record<string, string>> {
    const { GET } = await import("../../app/api/wiki/export/route");
    const url = `http://localhost/api/wiki/export${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`;
    const res = await GET(new Request(url) as never);
    if (res.status !== 200) return {}; // e.g. 400 "no pages" — empty vault
    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf);
    const out: Record<string, string> = {};
    for (const [name, data] of Object.entries(files)) out[name] = strFromU8(data);
    return out;
  }

  it("scopes the vault to one owner and excludes others' private pages", async () => {
    await writeWikiPage(
      "alice-pub",
      serializeFrontmatter({ owner: "alice", visibility: "public" }, "# Alice Pub"),
    );
    await writeWikiPage(
      "bob-priv",
      serializeFrontmatter({ owner: "bob", visibility: "private" }, "# Bob Priv"),
    );
    await updateIndex([
      { slug: "alice-pub", title: "Alice Pub", summary: "p" },
      { slug: "bob-priv", title: "Bob Priv", summary: "s" },
    ]);

    const files = await exportZip("owner:alice");
    expect(Object.keys(files).sort()).toEqual(["alice-pub.md", "index.md"]);
    // An anonymous caller (tests have no principal) can never get bob's private
    // page even by scoping to him.
    const bobFiles = await exportZip("owner:bob");
    expect(bobFiles["bob-priv.md"]).toBeUndefined();
  });

  it("converts internal links to wikilinks in the exported markdown", async () => {
    await writeWikiPage(
      "a",
      serializeFrontmatter({ owner: "alice" }, "# A\n\nSee [B](b.md)."),
    );
    await writeWikiPage("b", serializeFrontmatter({ owner: "alice" }, "# B"));
    await updateIndex([
      { slug: "a", title: "A", summary: "" },
      { slug: "b", title: "B", summary: "" },
    ]);
    const files = await exportZip("owner:alice");
    expect(files["a.md"]).toContain("[[b|B]]");
  });

  it("bundles a page's binary assets into the vault under assets/<slug>/", async () => {
    await writeWikiPage(
      "withimg",
      serializeFrontmatter(
        { owner: "alice" },
        "# WithImg\n\n![pic](assets/withimg/pic.png)",
      ),
    );
    await updateIndex([{ slug: "withimg", title: "WithImg", summary: "" }]);
    await getStorage().writeAsset(
      rawRelPath("assets/withimg/pic.png"),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    );

    const files = await exportZip("owner:alice");
    expect(Object.keys(files)).toContain("assets/withimg/pic.png");
  });

  it("sanitizes the handle in Content-Disposition (no header injection)", async () => {
    // Owner with a quote: ownerToTenant keeps `"`, so the scope resolves — the
    // filename must NOT contain the raw quote that would break the header.
    await writeWikiPage(
      "q",
      serializeFrontmatter({ owner: 'alice"x' }, "# Q"),
    );
    await updateIndex([{ slug: "q", title: "Q", summary: "" }]);

    const { GET } = await import("../../app/api/wiki/export/route");
    const res = await GET(
      new Request('http://localhost/api/wiki/export?scope=owner:alice"x') as never,
    );
    const cd = res.headers.get("content-disposition") ?? "";
    expect(res.status).toBe(200);
    expect(cd).toContain('filename="alice-x-vault.zip"'); // sanitized
    expect(cd).not.toContain('alice"x-vault.zip'); // raw quote not injected
  });
});
