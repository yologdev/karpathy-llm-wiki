import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { belongsInCommons } from "@/lib/commons";
import { addVaultRef, removeVaultRef } from "@/lib/vault";
import { logger } from "@/lib/logger";

/**
 * Curate / uncurate a commons page into YOUR vault — a personal reference lens
 * over the commons.
 *
 *   POST   /api/vault   { slug }  → curate (add a reference)
 *   DELETE /api/vault   { slug }  → uncurate (remove the reference)
 *
 * The target vault is the caller's own, derived from the session (never the
 * body). Curating references a single, collective commons page — no copy is
 * made — so only PUBLIC, non-agent (commons) pages can be added. Uncurating just
 * drops the reference and is allowed regardless of the page's current state.
 */
async function handle(req: Request, curate: boolean) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    let body: { slug?: unknown };
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

    if (!curate) {
      // Uncurate: just drop the reference (the page may have gone private since
      // it was curated — removal must always work).
      await removeVaultRef(principal.handle, slug);
      return NextResponse.json({ curated: false, slug });
    }

    // Curate: the page must exist and be a commons page (public, non-agent) —
    // you reference the collective page, you don't copy it.
    const page = await readWikiPageWithFrontmatter(slug);
    if (!page) {
      return NextResponse.json(
        { error: `Page "${slug}" not found` },
        { status: 404 },
      );
    }
    if (
      !belongsInCommons({
        visibility:
          typeof page.frontmatter.visibility === "string"
            ? page.frontmatter.visibility
            : undefined,
        type:
          typeof page.frontmatter.type === "string"
            ? page.frontmatter.type
            : undefined,
      })
    ) {
      return NextResponse.json(
        { error: "Only public commons pages can be curated into a vault." },
        { status: 400 },
      );
    }

    await addVaultRef(principal.handle, slug);
    return NextResponse.json({ curated: true, slug });
  } catch (err) {
    logger.error("vault", "curate toggle failed:", err);
    return NextResponse.json(
      { error: "Failed to update vault." },
      { status: 500 },
    );
  }
}

export const POST = (req: Request) => handle(req, true);
export const DELETE = (req: Request) => handle(req, false);
