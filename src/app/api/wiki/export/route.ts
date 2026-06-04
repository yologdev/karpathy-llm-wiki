import { zipSync, strToU8 } from "fflate";
import type { NextRequest } from "next/server";
import { listReadableWikiPages, readWikiPage, rawRelPath } from "@/lib/wiki";
import { getStorage } from "@/lib/storage";
import { isEnoent } from "@/lib/errors";
import { getPrincipal } from "@/lib/auth";
import { expandMineScope, resolveScope } from "@/lib/search";
import { convertToObsidianLinks, normalizeVaultAssetPaths } from "@/lib/export";

/**
 * GET /api/wiki/export[?scope=mine|owner:<handle>]
 *
 * Returns an Obsidian-compatible **vault zip**. Unscoped → every readable page;
 * scoped → just that silo's pages ("download my vault" from a /u/<handle>).
 * Each page is a markdown file with internal links converted to wikilinks
 * (`[[slug|Title]]`); YAML frontmatter is preserved (Obsidian reads it). Binary
 * **assets** (images) are included under `assets/<slug>/…` and image paths are
 * normalized so they resolve in the vault. Scoped reads are readability-gated:
 * the scope only narrows the already-readable set, so it can't export another
 * user's private pages.
 *
 * Uses fflate (pure JS) so this runs on Cloudflare Workers as well as Node.
 */
export async function GET(req: NextRequest) {
  try {
    const principal = await getPrincipal();
    const scopeParam = new URL(req.url).searchParams.get("scope") || undefined;
    const expanded = expandMineScope(scopeParam, principal);

    let pages = await listReadableWikiPages(principal);
    let vaultName = "yopedia";
    if (expanded) {
      const resolved = await resolveScope(expanded);
      const scopeSet = new Set(resolved?.slugs ?? []);
      pages = pages.filter((p) => scopeSet.has(p.slug));
      const ownerMatch = expanded.match(/^owner:(.+)$/);
      if (ownerMatch) vaultName = ownerMatch[1].trim() || vaultName;
    }

    if (pages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No wiki pages to export" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const storage = getStorage();
    const files: Record<string, Uint8Array> = {};

    for (const entry of pages) {
      const page = await readWikiPage(entry.slug);
      if (!page) continue;

      const md = normalizeVaultAssetPaths(convertToObsidianLinks(page.content));
      files[`${entry.slug}.md`] = strToU8(md);

      // Bundle the page's binary assets (images) so the vault is self-contained.
      let assetFiles: Awaited<ReturnType<typeof storage.listFiles>> = [];
      try {
        assetFiles = await storage.listFiles(rawRelPath(`assets/${entry.slug}`));
      } catch (e) {
        if (!isEnoent(e)) throw e;
      }
      for (const f of assetFiles) {
        if (f.isDirectory) continue;
        try {
          const data = await storage.readAsset(
            rawRelPath(`assets/${entry.slug}/${f.name}`),
          );
          files[`assets/${entry.slug}/${f.name}`] = new Uint8Array(data);
        } catch {
          // Skip a single unreadable asset rather than fail the whole vault.
        }
      }
    }

    // Rebuild index.md from the exported pages only (never list pages the
    // caller can't read or that fall outside the scope).
    const indexLines = pages.map(
      (p) => `- [${p.title}](${p.slug}.md) — ${p.summary}`,
    );
    files["index.md"] = strToU8(
      convertToObsidianLinks(`# Wiki Index\n\n${indexLines.join("\n")}\n`),
    );

    const zipped = zipSync(files, { level: 9 });

    // `vaultName` derives from the handle (user-controlled via ?scope=), so
    // NEVER interpolate it raw into the header — a `"` would break the quoted
    // filename. Sanitize to an ASCII-safe token for `filename=` and add an
    // RFC 5987 `filename*` (percent-encoded) so unicode handles still display.
    const fileBase = `${vaultName}-vault.zip`;
    const asciiName =
      `${vaultName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}` ||
      "yopedia";
    return new Response(zipped.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiName}-vault.zip"; filename*=UTF-8''${encodeURIComponent(fileBase)}`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Export failed", details: String(err) },
      { status: 500 },
    );
  }
}
