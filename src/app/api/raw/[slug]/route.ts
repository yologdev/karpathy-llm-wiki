import { NextResponse } from "next/server";
import { decodeSlug } from "@/lib/slugify";
import { readRawSource, readRawSourceById } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
import { canReadSlug } from "@/lib/authz";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/raw/[slug][?source=<rawId>]
 *
 * Returns a raw source as `text/plain`, suitable for download or programmatic
 * inspection. Without `?source`, returns the latest single blob; with a
 * `?source=<rawId>`, returns that per-source snapshot. Thin read-only wrapper —
 * the library functions own the path-traversal guard and not-found semantics.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: encodedSlug } = await params;
    const slug = decodeSlug(encodedSlug);
    // A private page's raw source is owner-only — 404 otherwise (same as missing).
    if (!(await canReadSlug(slug, await getPrincipal()))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const sourceId = new URL(req.url).searchParams.get("source");
    const source = sourceId
      ? await readRawSourceById(slug, sourceId)
      : await readRawSource(slug);
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
