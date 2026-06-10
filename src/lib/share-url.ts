import { belongsInCommons } from "./commons";
import { commonsPath, pagePath } from "./links";
import { tenantForOwner } from "./wiki";

/** Narrow an unknown frontmatter value to a string (or undefined). */
export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * The canonical wiki URL for a page, from its frontmatter: a PUBLIC commons page
 * resolves to the global `/wiki/<slug>`; everything else (private, agent-scoped,
 * or an html artifact — all excluded from the commons) resolves to the
 * owner-scoped `/u/<tenant>/<slug>`. Mirrors the owner route's commons-vs-owner
 * branch so the share view's "Open in wiki" link points at the right home.
 */
export function wikiUrlFor(
  slug: string,
  fm: { owner?: unknown; visibility?: unknown; type?: unknown },
): string {
  return belongsInCommons({ visibility: str(fm.visibility), type: str(fm.type) })
    ? commonsPath(slug)
    : pagePath(tenantForOwner(str(fm.owner)), slug);
}
