import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { isInVault } from "@/lib/vault";

/**
 * Whether a slug is curated into the SIGNED-IN viewer's vault.
 *
 *   GET /api/vault/status?slug=<slug>  → { inVault: boolean }
 *
 * Signed-in only (401 otherwise). The target vault is the caller's own, derived
 * from the session — never a query param. Used by the client action bar to know
 * whether to show "Save to vault" vs "In your vault" on a public commons page
 * (the server route still re-checks ownership/visibility on the write).
 */
export async function GET(req: Request): Promise<Response> {
  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { error: "Missing 'slug'" },
      { status: 400 },
    );
  }
  const inVault = await isInVault(principal.handle, slug);
  return NextResponse.json({ inVault });
}
