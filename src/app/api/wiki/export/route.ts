import { zipSync, strToU8 } from "fflate";
import { listReadableWikiPages, readWikiPage } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
import { convertToObsidianLinks } from "@/lib/export";

/**
 * GET /api/wiki/export
 *
 * Returns the entire wiki as an Obsidian-compatible zip vault.
 * Each page is exported as a markdown file with internal links converted to
 * Obsidian wikilink syntax (`[[slug|Title]]`). YAML frontmatter is preserved
 * as-is since Obsidian reads it natively.
 *
 * Uses fflate (pure JS) instead of archiver so this route can run in
 * Cloudflare Workers as well as Node.js.
 */
export async function GET() {
  try {
    const principal = await getPrincipal();
    const pages = await listReadableWikiPages(principal);

    if (pages.length === 0) {
      return new Response(JSON.stringify({ error: "No wiki pages to export" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build a map of filename → compressed Uint8Array content
    const files: Record<string, Uint8Array> = {};

    for (const entry of pages) {
      const page = await readWikiPage(entry.slug);
      if (!page) continue;

      const obsidianContent = convertToObsidianLinks(page.content);
      files[`${entry.slug}.md`] = strToU8(obsidianContent);
    }

    // Rebuild index.md from the readable pages only — the raw index file lists
    // every page (including private ones the caller can't read).
    const indexLines = pages.map(
      (p) => `- [${p.title}](${p.slug}.md) — ${p.summary}`,
    );
    files["index.md"] = strToU8(
      convertToObsidianLinks(`# Wiki Index\n\n${indexLines.join("\n")}\n`),
    );

    // Create the zip synchronously (pure JS, no Node.js streams)
    const zipped = zipSync(files, { level: 9 });

    return new Response(zipped.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="yopedia-vault.zip"',
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Export failed", details: String(err) },
      { status: 500 }
    );
  }
}
