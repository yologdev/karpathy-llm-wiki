import { NextResponse, type NextRequest } from "next/server";
import { buildWikiGraph } from "@/lib/graph-build";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    // Unscoped → the public commons graph. Scoped (`?scope=mine|owner:<h>`) →
    // that silo's readable pages (incl. the viewer's own private pages). Unlike
    // query, an empty "mine" shows an empty graph (your silo), not the commons.
    const scopeParam =
      new URL(req.url).searchParams.get("scope") || undefined;
    const principal = await getPrincipal();

    const { nodes, edges } = await buildWikiGraph(
      scopeParam ?? null,
      principal,
    );

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    logger.error("wiki", "Graph API error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
