import { NextResponse } from "next/server";
import { fuzzySearchWikiContent, resolveScope } from "@/lib/search";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/wiki/search?q=search+terms&scope=agent:yoyo
 *
 * Full-text search across wiki page content.
 * Returns matching pages with snippets showing match context.
 * Falls back to fuzzy matching when exact results are sparse.
 *
 * When `scope` is provided, only pages within that scope are searched.
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

    const scopeParam = url.searchParams.get("scope");
    let scope;
    if (scopeParam) {
      scope = await resolveScope(scopeParam);
      if (!scope) {
        return NextResponse.json(
          { error: "Invalid scope or agent not found" },
          { status: 400 },
        );
      }
    }

    const results = await fuzzySearchWikiContent(q, 10, scope);
    return NextResponse.json({ results });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
