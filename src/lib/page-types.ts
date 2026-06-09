/**
 * Pure, client-safe predicates over a page's frontmatter `type`. Split out of
 * `wiki.ts` (which pulls in the server-only auth/storage layer) so client
 * components — e.g. `BrowseClient` — can classify a page without bundling the
 * server. `wiki.ts` re-exports these for existing server importers.
 */

/**
 * True when a page `type` marks it as agent-scoped (`agent-identity`,
 * `agent-knowledge`, …). Such pages are excluded from the public browse feed
 * and general search, surfacing only via an `agent:` scope.
 */
export function isAgentScopedType(type: string | undefined): boolean {
  return typeof type === "string" && type.startsWith("agent-");
}

/**
 * True when a page `type` marks it as a saved RENDERED ARTIFACT (e.g. an `html`
 * query output), not synthesized knowledge. Artifacts are reachable by URL and
 * the owner's lens, but excluded from the commons, general search, and the query
 * corpus — their raw markup isn't canonical content and would pollute ranking.
 */
export function isArtifactType(type: string | undefined): boolean {
  return type === "html";
}
