import { NextResponse } from "next/server";
import {
  validateSlug,
  readWikiPage,
  listWikiPages,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
  type Frontmatter,
} from "@/lib/wiki";
import { extractSummary } from "@/lib/ingest";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/wiki
 *
 * Lightweight list of all wiki pages (slug, title, summary).
 * Much cheaper than /api/wiki/graph which reads every page and builds a link graph.
 */
export async function GET() {
  try {
    const entries = await listWikiPages();
    return NextResponse.json({ pages: entries });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const author =
      body && typeof body === "object" && "author" in body
        ? (body as { author: unknown }).author
        : undefined;
    const authorStr =
      typeof author === "string" && author.trim().length > 0
        ? author.trim()
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
    // Compute a default expiry 90 days from now (matches SCHEMA.md standard)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);
    const expiry = expiryDate.toISOString().slice(0, 10);

    const frontmatter: Frontmatter = {
      created: today,
      confidence: 0.5,
      authors: [authorStr ?? "anonymous"],
      contributors: [],
      expiry,
      sources: [],
    };
    const fullContent = serializeFrontmatter(frontmatter, content);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title,
      content: fullContent,
      summary,
      logOp: "ingest",
      crossRefSource: content,
      author: authorStr,
      logDetails: (ctx) =>
        `created · found ${ctx.updatedSlugs.length} cross-ref(s)`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = getErrorMessage(err);
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
