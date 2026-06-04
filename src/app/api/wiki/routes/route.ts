import { NextResponse } from "next/server";
import { listReadableWikiPages, ownerToTenant } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";

/**
 * slug → canonical tenant, over the caller's READABLE pages. Lets client
 * components (search, query sources, lint, batch, ingest) build canonical
 * `/u/<tenant>/<slug>` links without threading `owner` through every payload.
 * Readability-gated: a private page only appears in its owner's map, so this
 * never leaks another user's private slugs. Unknown slugs fall back to the
 * legacy `/wiki/<slug>` route (which 308-redirects) on the client.
 */
export async function GET() {
  const pages = await listReadableWikiPages(await getPrincipal());
  const map: Record<string, string> = {};
  for (const p of pages) map[p.slug] = ownerToTenant(p.owner);
  return NextResponse.json(map);
}
