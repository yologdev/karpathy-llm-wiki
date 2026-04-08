import { NextResponse } from "next/server";
import {
  deleteWikiPage,
  readWikiPage,
  writeWikiPageWithSideEffects,
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
 * Replace the content of an existing wiki page. Returns 404 when the slug
 * doesn't exist — edit is strictly an update operation, use the ingest flow
 * (or a future create endpoint) to add new pages.
 *
 * Body: `{ content: string }` — the full new markdown content.
 *
 * The edit flows through {@link writeWikiPageWithSideEffects}, so the index,
 * cross-references, and activity log all stay consistent.
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

    const content =
      body && typeof body === "object" && "content" in body
        ? (body as { content: unknown }).content
        : undefined;

    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content must be a non-empty string" },
        { status: 400 },
      );
    }

    const existing = await readWikiPage(slug);
    if (!existing) {
      return NextResponse.json(
        { error: `page not found: ${slug}` },
        { status: 404 },
      );
    }

    // Derive title from the new content's first H1, falling back to the old title.
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : existing.title;

    // Strip the leading H1 (if present) before deriving the summary so the
    // heading text doesn't end up as the summary line.
    const contentForSummary = content.replace(/^#\s+.+$/m, "").trim();
    const summary = extractSummary(contentForSummary);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title,
      content,
      summary,
      logOp: "edit",
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
