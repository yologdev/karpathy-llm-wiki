/**
 * Pure, client-safe predicates over a page's frontmatter `type`. Split out of
 * `wiki.ts` (which pulls in the server-only auth/storage layer) so client
 * components — e.g. `BrowseClient` — can classify a page without bundling the
 * server. `wiki.ts` re-exports these for existing server importers.
 */

import type { IndexEntry } from "./types";
import { isAgentHandle, isAutomationActor } from "./agent-handle";

/** A human owner: attributed, and neither an agent nor an automation actor. */
function isHumanOwner(owner: string | undefined): boolean {
  return !!owner && !isAgentHandle(owner) && !isAutomationActor(owner);
}

/**
 * True when a page `type` marks it as agent-scoped (`agent-identity`,
 * `agent-knowledge`, …). Such pages are excluded from the public browse feed
 * and general search, surfacing only via an `agent:` scope.
 */
export function isAgentScopedType(type: string | undefined): boolean {
  return typeof type === "string" && type.startsWith("agent-");
}

/**
 * True when a page `type` marks it as a saved RENDERED ARTIFACT (an `html` query
 * output or a `slides` deck), not synthesized knowledge. Artifacts are reachable
 * by URL and the owner's lens, but excluded from the commons, general search,
 * and the query corpus — their raw markup (and inlined illustration data URIs)
 * isn't canonical content and would pollute ranking.
 */
export function isArtifactType(type: string | undefined): boolean {
  return type === "html" || type === "slides";
}

/**
 * Select the artifacts to feature on the homepage gallery: recent PUBLIC,
 * HUMAN-MADE `html`/`slides` pages, newest-updated first, capped at `limit`.
 *
 * "Personal" means human-made: agent-owned (`<owner>--yoyo`/`yoyo`) and
 * automation (system / linter / seed) artifacts are excluded, as are
 * unattributed ones — the gallery showcases what people build.
 *
 * SECURITY: the homepage renders anonymously and is cached, so this filters to
 * NON-PRIVATE artifacts only — a `visibility:"private"` page must never surface
 * there. (A missing `visibility` is public by default, matching the rest of the
 * read model.) Pure so the invariants are unit-tested away from the page.
 */
export function selectFeaturedArtifacts(
  pages: IndexEntry[],
  limit = 6,
): IndexEntry[] {
  return pages
    .filter(
      (p) =>
        isArtifactType(p.type) &&
        p.visibility !== "private" &&
        isHumanOwner(p.owner),
    )
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, limit);
}
