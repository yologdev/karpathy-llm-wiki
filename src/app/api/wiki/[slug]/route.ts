import { NextResponse } from "next/server";
import {
  deleteWikiPage,
  readWikiPageWithFrontmatter,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
  type Frontmatter,
} from "@/lib/wiki";
import { extractSummary } from "@/lib/ingest";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const result = await deleteWikiPage(slug);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = message.startsWith("page not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/wiki/[slug]
 *
 * Replace the body of an existing wiki page. Returns 404 when the slug
 * doesn't exist — edit is strictly an update operation, use the ingest flow
 * (or a future create endpoint) to add new pages.
 *
 * Body: `{ content: string }` — the new markdown **body** (no YAML
 * frontmatter). The editor never exposes the YAML block to users; the
 * server owns frontmatter end-to-end.
 *
 * On save the route:
 *   1. Reads the existing page's parsed frontmatter.
 *   2. Bumps `updated` to today (YYYY-MM-DD), backfilling `created` for
 *      legacy pages that were written before frontmatter existed.
 *   3. Preserves every other key (`source_count`, `tags`, and any extras).
 *   4. Re-serializes `frontmatter + body` via {@link serializeFrontmatter}
 *      and writes through {@link writeWikiPageWithSideEffects} so the
 *      index, cross-references, and activity log all stay consistent.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }

    const newBody =
      body && typeof body === "object" && "content" in body
        ? (body as { content: unknown }).content
        : undefined;

    if (typeof newBody !== "string" || newBody.trim().length === 0) {
      return NextResponse.json(
        { error: "content must be a non-empty string" },
        { status: 400 },
      );
    }

    const existing = await readWikiPageWithFrontmatter(slug);
    if (!existing) {
      return NextResponse.json(
        { error: `page not found: ${slug}` },
        { status: 404 },
      );
    }

    // Derive title from the new body's first H1, falling back to the old title.
    const titleMatch = newBody.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : existing.title;

    // Strip the leading H1 (if present) before deriving the summary so the
    // heading text doesn't end up as the summary line.
    const bodyForSummary = newBody.replace(/^#\s+.+$/m, "").trim();
    const summary = extractSummary(bodyForSummary);

    // Merge frontmatter: preserve everything the existing page had, then
    // bump `updated` (and backfill `created` for legacy pages that predate
    // frontmatter entirely).
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const mergedFrontmatter: Frontmatter = { ...existing.frontmatter };
    if (
      typeof mergedFrontmatter.created !== "string" ||
      mergedFrontmatter.created === ""
    ) {
      mergedFrontmatter.created = today;
    }
    mergedFrontmatter.updated = today;

    const mergedContent = serializeFrontmatter(mergedFrontmatter, newBody);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title,
      content: mergedContent,
      summary,
      logOp: "edit",
      // Use the user-visible body as the cross-ref signal so the YAML
      // block doesn't bias related-page matching.
      crossRefSource: newBody,
      logDetails: (ctx) =>
        `edited · updated ${ctx.updatedSlugs.length} cross-ref(s)`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
