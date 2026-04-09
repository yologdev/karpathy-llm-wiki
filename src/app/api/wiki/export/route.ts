import archiver from "archiver";
import { listWikiPages, readWikiPage } from "@/lib/wiki";
import { convertToObsidianLinks } from "@/lib/export";

/**
 * GET /api/wiki/export
 *
 * Returns the entire wiki as an Obsidian-compatible zip vault.
 * Each page is exported as a markdown file with internal links converted to
 * Obsidian wikilink syntax (`[[slug|Title]]`). YAML frontmatter is preserved
 * as-is since Obsidian reads it natively.
 */
export async function GET() {
  const pages = await listWikiPages();

  if (pages.length === 0) {
    return new Response(JSON.stringify({ error: "No wiki pages to export" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });

  // Track which slugs we've added so we don't double-add index
  const added = new Set<string>();

  for (const entry of pages) {
    const page = await readWikiPage(entry.slug);
    if (!page) continue;

    const obsidianContent = convertToObsidianLinks(page.content);
    archive.append(obsidianContent, { name: `${entry.slug}.md` });
    added.add(entry.slug);
  }

  // Ensure index.md is included even if it isn't in the index entries
  if (!added.has("index")) {
    const indexPage = await readWikiPage("index");
    if (indexPage) {
      archive.append(convertToObsidianLinks(indexPage.content), {
        name: "index.md",
      });
    }
  }

  // Finalize — this signals no more files will be added.
  // archiver emits data asynchronously after this call.
  archive.finalize();

  // Convert the Node.js Readable (archiver output) into a Web ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      archive.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      archive.on("end", () => {
        controller.close();
      });
      archive.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="llm-wiki-vault.zip"',
    },
  });
}
