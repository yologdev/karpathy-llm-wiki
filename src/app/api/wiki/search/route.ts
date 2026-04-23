import { NextResponse } from "next/server";
import { fuzzySearchWikiContent } from "@/lib/wiki";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/wiki/search?q=search+terms
 *
 * Full-text search across wiki page content.
 * Returns matching pages with snippets showing match context.
 * Falls back to fuzzy matching when exact results are sparse.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();

    if (!q || q.length === 0) {
      return NextResponse.json(
        { error: "q parameter is required" },
        { status: 400 },
      );
    }

    const results = await fuzzySearchWikiContent(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
