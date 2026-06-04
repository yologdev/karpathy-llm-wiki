import { NextResponse } from "next/server";
import { decodeSlug } from "@/lib/slugify";
import { readRawSource } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
import { canReadSlug } from "@/lib/authz";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/raw/[slug]
 *
 * Returns a single raw source as `text/plain`, suitable for download or
 * programmatic inspection. This is a thin read-only wrapper over
 * {@link readRawSource}; the library function owns both the path-traversal
 * guard and the not-found semantics.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: encodedSlug } = await params;
    const slug = decodeSlug(encodedSlug);
    // A private page's raw source is owner-only — 404 otherwise (same as missing).
    if (!(await canReadSlug(slug, await getPrincipal()))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const source = await readRawSource(slug);
    return new NextResponse(source.content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Advise (but don't force) a sensible filename when users hit
        // "save as" — browsers still render inline by default.
        "Content-Disposition": `inline; filename="${source.filename}"`,
      },
    });
  } catch (err) {
    const message = getErrorMessage(err);
    // Both "invalid slug" and "not found" collapse to 404 from the
    // caller's perspective — neither reveals whether a file exists.
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
