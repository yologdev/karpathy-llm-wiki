import { NextResponse } from "next/server";
import {
  setPageShared,
  agentIdFor,
  DEFAULT_AGENT_NAME,
} from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { logger } from "@/lib/logger";

/**
 * Share / unshare one of YOUR pages into YOUR yoyo's context.
 *
 *   POST   /api/agents/share   { slug, agentName? }  → share
 *   DELETE /api/agents/share   { slug, agentName? }  → unshare
 *
 * "Share" is a grant, not a copy: it tags the page's `sharedWith` frontmatter
 * with the agent id. The target agent is derived from the session (you can only
 * share into your OWN yoyo), and you can only share pages you own/contributed.
 */
async function handle(req: Request, shared: boolean) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    let body: { slug?: unknown; agentName?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const slug = body?.slug;
    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'slug'" },
        { status: 400 },
      );
    }

    // No .catch: readWikiPage returns null for a genuinely missing page (→ 404);
    // a malformed-frontmatter throw should fall through to the 500 (and be
    // logged) rather than masquerade as "not found".
    const page = await readWikiPageWithFrontmatter(slug);
    if (!page) {
      return NextResponse.json(
        { error: `Page "${slug}" not found` },
        { status: 404 },
      );
    }

    // You can only share pages you own or have contributed to.
    const owner =
      typeof page.frontmatter.owner === "string" ? page.frontmatter.owner : "";
    const contributors = Array.isArray(page.frontmatter.contributors)
      ? (page.frontmatter.contributors as string[])
      : [];
    if (owner !== principal.handle && !contributors.includes(principal.handle)) {
      return NextResponse.json(
        { error: "You can only share pages you own or contributed to." },
        { status: 403 },
      );
    }

    // Target = the caller's own yoyo (derived from the session, not the body).
    const name =
      typeof body.agentName === "string" ? body.agentName : DEFAULT_AGENT_NAME;
    const agentId = agentIdFor(principal.handle, name);

    await setPageShared(slug, agentId, shared);
    return NextResponse.json({ shared, slug, agentId });
  } catch (err) {
    // This is the only place a real write/parse failure is observable — log it.
    logger.error("agents", "share toggle failed:", err);
    return NextResponse.json(
      { error: "Failed to update sharing." },
      { status: 500 },
    );
  }
}

export const POST = (req: Request) => handle(req, true);
export const DELETE = (req: Request) => handle(req, false);
