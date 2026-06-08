import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import {
  searchCommons,
  BROWSE_PAGE_SIZE,
  type BrowseSort,
  type BrowsePayload,
} from "@/lib/browse";
import { logger } from "@/lib/logger";

/**
 * GET /api/wiki/browse?q=&scope=all&tag=&sort=recent&page=1&pageSize=30
 *
 * Server-side hybrid (BM25 + vector) search + pagination for the Browse surface.
 * Public-readable: returns the commons by default; `principal` is resolved only
 * to expand a `vault:<id>` scope to the viewer's readable pages. The pool is
 * pre-filtered in searchCommons, so a search never surfaces another user's
 * private page or any agent-scoped page (a `vault:<id>` scope may include the
 * viewer's OWN private pages — visible only to them).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const scope = url.searchParams.get("scope") || "all";
  const tag = url.searchParams.get("tag");
  const sortParam = url.searchParams.get("sort");
  const sort: BrowseSort =
    sortParam === "confidence" || sortParam === "sources" ? sortParam : "recent";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "", 10) || BROWSE_PAGE_SIZE),
  );

  try {
    const principal = await getPrincipal();
    const data = await searchCommons(q, { scope, tag, sort, page, pageSize, principal });
    const payload: BrowsePayload = { ...data, page, pageSize };
    return NextResponse.json(payload);
  } catch (err) {
    // A failure here (KV read, auth context, vector store) must be traceable
    // with the request context — otherwise it surfaces as an opaque 500 that the
    // client silently maps to "no change". Log it and return a real error status.
    logger.error("browse", `searchCommons failed (scope=${scope} q=${q ?? ""} page=${page}):`, err);
    return NextResponse.json({ error: "Browse search failed" }, { status: 500 });
  }
}
