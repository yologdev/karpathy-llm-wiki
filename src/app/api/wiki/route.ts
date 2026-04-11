import { NextResponse } from "next/server";
import {
  validateSlug,
  readWikiPage,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
  type Frontmatter,
} from "@/lib/wiki";
import { extractSummary } from "@/lib/ingest";

/**
 * POST /api/wiki
 *
 * Create a brand-new wiki page. Returns 409 if the slug already exists —
 * use PUT /api/wiki/[slug] to update an existing page.
 *
 * Body: `{ slug: string, content: string }`
 */
export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }

    const slug =
      body && typeof body === "object" && "slug" in body
        ? (body as { slug: unknown }).slug
        : undefined;
    const content =
      body && typeof body === "object" && "content" in body
        ? (body as { content: unknown }).content
        : undefined;

    if (typeof slug !== "string" || slug.trim().length === 0) {
      return NextResponse.json(
        { error: "slug must be a non-empty string" },
        { status: 400 },
      );
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content must be a non-empty string" },
        { status: 400 },
      );
    }

    validateSlug(slug);

    // Conflict check — don't overwrite existing pages
    const existing = await readWikiPage(slug);
    if (existing) {
      return NextResponse.json(
        { error: `page already exists: ${slug}` },
        { status: 409 },
      );
    }

    // Derive title from the first H1, falling back to slug
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    const bodyForSummary = content.replace(/^#\s+.+$/m, "").trim();
    const summary = extractSummary(bodyForSummary);

    const today = new Date().toISOString().slice(0, 10);
    const frontmatter: Frontmatter = { created: today };
    const fullContent = serializeFrontmatter(frontmatter, content);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title,
      content: fullContent,
      summary,
      logOp: "ingest",
      crossRefSource: content,
      logDetails: (ctx) =>
        `created · found ${ctx.updatedSlugs.length} cross-ref(s)`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
