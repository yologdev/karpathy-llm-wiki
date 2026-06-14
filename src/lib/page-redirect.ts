/**
 * Forwarding for a slug that has no page of its own — so a **merged-away** or
 * renamed slug keeps working instead of 404-ing. `mergePages` records the
 * absorbed slug as an alias of the survivor, so the alias index maps it straight
 * to the canonical slug.
 */

import { resolveAlias } from "./alias-index";
import { readWikiPageWithFrontmatter } from "./wiki";
import { belongsInCommons } from "./commons";
import { commonsPath } from "./links";

/**
 * Where `/wiki/<slug>` should 308 when no page exists at `slug`. Returns the
 * canonical commons URL when an alias maps `slug` to a DIFFERENT, readable
 * **public commons** page; otherwise `null` (caller 404s).
 *
 * Security: only ever forwards to a PUBLIC commons page — never a private or
 * missing one (a private page must not be confirmed via a redirect). Resolves
 * exactly once: the alias index maps directly to the canonical slug, so there is
 * no chain to loop on.
 */
export async function commonsRedirectForMissing(
  slug: string,
): Promise<string | null> {
  const canonical = await resolveAlias(slug);
  if (!canonical || canonical === slug) return null;

  const target = await readWikiPageWithFrontmatter(canonical);
  if (!target) return null; // alias points at a missing page — don't forward

  const fm = target.frontmatter;
  const isPublicCommons = belongsInCommons({
    visibility: typeof fm.visibility === "string" ? fm.visibility : undefined,
    type: typeof fm.type === "string" ? fm.type : undefined,
  });
  if (!isPublicCommons) return null; // never forward to a private page

  return commonsPath(canonical);
}
