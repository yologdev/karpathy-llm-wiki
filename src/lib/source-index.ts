// ---------------------------------------------------------------------------
// Source Index — maps a source (URL or content hash) to its canonical slug
// ---------------------------------------------------------------------------
//
// Deduplication at ingest time. Before fetching + synthesizing a source, the
// ingest pipeline checks whether the same source has already been ingested:
//   - `source_url` frontmatter → canonical slug (URL ingests)
//   - `content_hash` frontmatter → canonical slug (text/identical-content ingests)
//
// On a hit, the ingest pipeline attaches the new triggerer to the existing
// canonical page instead of re-running the LLM + embedding — saving tokens and
// keeping the commons to one page per source. Mirrors the in-memory, rebuilt-
// from-frontmatter approach of `alias-index.ts`.

import { listWikiPages, readWikiPageWithFrontmatter } from "./wiki";

// ---------------------------------------------------------------------------
// Types + singleton
// ---------------------------------------------------------------------------

export interface SourceIndex {
  /** Maps `source_url` → canonical slug */
  byUrl: Map<string, string>;
  /** Maps `content_hash` → canonical slug */
  byHash: Map<string, string>;
}

let cachedIndex: SourceIndex | null = null;

/** Reset the cached source index (for testing or after bulk writes). */
export function resetSourceIndex(): void {
  cachedIndex = null;
}

/** Normalize a URL for stable matching (trim; drop a single trailing slash). */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Build / rebuild
// ---------------------------------------------------------------------------

/**
 * Build the source index by scanning all wiki pages' frontmatter for
 * `source_url` and `content_hash`. Cheap (one listing + frontmatter parse per
 * page) and small, like the alias index.
 */
export async function buildSourceIndex(): Promise<SourceIndex> {
  const index: SourceIndex = { byUrl: new Map(), byHash: new Map() };
  const pages = await listWikiPages();

  for (const entry of pages) {
    if (entry.slug === "index" || entry.slug === "log") continue;
    const page = await readWikiPageWithFrontmatter(entry.slug);
    if (!page) continue;

    const url = page.frontmatter.source_url;
    if (typeof url === "string" && url.trim() !== "" && url !== "text-paste") {
      index.byUrl.set(normalizeUrl(url), entry.slug);
    }
    const hash = page.frontmatter.content_hash;
    if (typeof hash === "string" && hash.trim() !== "") {
      index.byHash.set(hash, entry.slug);
    }
  }

  cachedIndex = index;
  return index;
}

/** Get the source index, building it if not cached. */
export async function getSourceIndex(): Promise<SourceIndex> {
  if (cachedIndex) return cachedIndex;
  return buildSourceIndex();
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** Resolve a source URL to an existing canonical slug, or null. */
export async function resolveSourceUrl(url: string): Promise<string | null> {
  if (!url || url.trim() === "" || url === "text-paste") return null;
  const index = await getSourceIndex();
  return index.byUrl.get(normalizeUrl(url)) ?? null;
}

/** Resolve a content hash to an existing canonical slug, or null. */
export async function resolveContentHash(hash: string): Promise<string | null> {
  if (!hash || hash.trim() === "") return null;
  const index = await getSourceIndex();
  return index.byHash.get(hash) ?? null;
}

// ---------------------------------------------------------------------------
// Incremental update / removal
// ---------------------------------------------------------------------------

/**
 * Update the cached index after a page write. No-op if the index isn't cached
 * yet (it'll be picked up on the next build).
 */
export function updateSourceIndexForPage(
  slug: string,
  sourceUrl: string | undefined,
  contentHash: string | undefined,
): void {
  if (!cachedIndex) return;
  if (
    typeof sourceUrl === "string" &&
    sourceUrl.trim() !== "" &&
    sourceUrl !== "text-paste"
  ) {
    cachedIndex.byUrl.set(normalizeUrl(sourceUrl), slug);
  }
  if (typeof contentHash === "string" && contentHash.trim() !== "") {
    cachedIndex.byHash.set(contentHash, slug);
  }
}

/** Remove all source-index entries pointing to a slug (called on delete). */
export function removeSourceForPage(slug: string): void {
  if (!cachedIndex) return;
  for (const [key, value] of cachedIndex.byUrl) {
    if (value === slug) cachedIndex.byUrl.delete(key);
  }
  for (const [key, value] of cachedIndex.byHash) {
    if (value === slug) cachedIndex.byHash.delete(key);
  }
}
