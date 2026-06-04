/**
 * Shared utilities for wiki link parsing and regex escaping.
 *
 * Centralises patterns that were previously duplicated across wiki.ts,
 * lifecycle.ts, and lint.ts.
 */

/**
 * Escape special regex characters in a string so it can be used
 * in a `new RegExp(...)` constructor safely.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A parsed wiki-style markdown link: `[text](slug.md)`
 */
export interface WikiLink {
  text: string;
  targetSlug: string;
}

/**
 * Extract all wiki-style markdown links from content.
 * Returns an array of { text, targetSlug } for each `[text](slug.md)` link found.
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const results: WikiLink[] = [];
  const re = /\[([^\]]*)\]\(([^)]+)\.md\)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    results.push({ text: match[1], targetSlug: match[2] });
  }
  return results;
}

/**
 * Test whether `content` contains a markdown link to `targetSlug.md`.
 */
export function hasLinkTo(content: string, targetSlug: string): boolean {
  const pattern = new RegExp(`\\]\\(${escapeRegex(targetSlug)}\\.md\\)`);
  return pattern.test(content);
}

// ---------------------------------------------------------------------------
// Canonical owner-qualified URL builders (tenant-silos P2)
//
// Pages are addressed by `(tenant, slug)` and live at `/u/<tenant>/<slug>`,
// where `tenant` is the lowercased owner handle. Old flat `/wiki/<slug>` URLs
// 308-redirect to these via thin shim routes.
//
// These are PURE string functions (no server imports) so client components can
// use them too: the server resolves `owner → tenant` and passes resolved tenant
// strings (and the slug→tenant map below) down as plain data.
// ---------------------------------------------------------------------------

/**
 * Catch-all tenant for ownerless / seed content. yopedia is built in public by
 * yoyo, so unattributed/seed pages are the platform's own — they belong to the
 * `yopedia` tenant. Defined here (a pure module) so both client and server
 * resolve owner→tenant identically; `wiki.ts` re-exports it.
 */
export const DEFAULT_TENANT = "yopedia";

/**
 * The canonical tenant for an owner handle: lowercased (owner checks are
 * case-insensitive, so one owner never splits across "Alice"/"alice" silos),
 * falling back to {@link DEFAULT_TENANT} for ownerless/seed content. The SINGLE
 * place tenant-from-owner is derived — used for the `/u/<tenant>/` URL, the
 * commons key, AND the physical silo folder, so all three stay identical.
 *
 * Normalizes the path-unsafe characters a tenant key/URL/folder can't contain
 * (whitespace, control chars, `/`, `\`, `.`) to `-`, so a free-form owner (e.g.
 * an API/MCP-supplied `"Jean Luc"`) still yields a valid, routable tenant rather
 * than a broken URL or a silo write that throws. Unicode (e.g. CJK handles) is
 * preserved — only the unsafe set is touched. Normal handles (Clerk usernames,
 * `alice--yoyo`) pass through unchanged apart from lowercasing.
 */
export function ownerToTenant(owner?: string | null): string {
  if (typeof owner !== "string") return DEFAULT_TENANT;
  const t = owner
    .trim()
    .toLowerCase()
    .replace(/[\s\u0000-\u001f/\\.]+/g, "-")
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
  return t.length > 0 ? t : DEFAULT_TENANT;
}

/** Canonical page URL `/u/<tenant>/<slug>`. */
export function pagePath(tenant: string, slug: string): string {
  return `/u/${tenant}/${slug}`;
}

/** Canonical edit URL `/u/<tenant>/<slug>/edit`. */
export function editPath(tenant: string, slug: string): string {
  return `/u/${tenant}/${slug}/edit`;
}

/** Canonical raw-source URL `/u/<tenant>/raw/<slug>`. */
export function rawPath(tenant: string, slug: string): string {
  return `/u/${tenant}/raw/${slug}`;
}

/**
 * A precomputed slug→tenant map for resolving links where only the target slug
 * is known (in-content wikilinks, backlinks). Pre-P5 slugs are globally unique,
 * so one slug maps to exactly one tenant.
 */
export type SlugTenantMap = Record<string, string>;

/**
 * Resolve a target slug to its canonical page path via a {@link SlugTenantMap},
 * falling back to `fallbackTenant` (typically the linking page's own tenant)
 * when the target isn't in the map — e.g. a dangling link to a missing page.
 */
export function resolveSlugPath(
  slug: string,
  slugTenants: SlugTenantMap | undefined,
  fallbackTenant: string,
): string {
  return `/u/${slugTenants?.[slug] ?? fallbackTenant}/${slug}`;
}
