/**
 * Server-side browse search for the `/wiki` (Browse the commons) surface.
 *
 * Replaces the old client-side substring filter, which only worked because the
 * page shipped the ENTIRE commons to the browser. That breaks the moment the
 * commons is paginated (the client would only ever search the page it holds).
 * Here the whole scope pool is ranked on the server: a HYBRID of BM25 (exact
 * keyword/title) fused with bge-m3 vector similarity (semantic) via RRF when a
 * query is present, or a plain facet sort when it isn't — then paginated.
 *
 * The vector store is global; every path intersects it against the already
 * visibility-scoped candidate pool, so a search never WIDENS visibility beyond
 * what the scope's pool already allows (same guard as the /query retrieval). For
 * `scope=all` that pool is public + non-agent by construction; for a `vault:<id>`
 * scope it's the viewer's readable vault refs with agent-scoped pages excluded —
 * so a viewer's OWN private page in their public vault stays visible to them (and
 * only them), but no search can surface another user's private page.
 */

import type { IndexEntry } from "./types";
import type { Principal } from "./auth";
import { listCommonsPages } from "./commons";
import { listReadableWikiPages, isAgentScopedType } from "./wiki";
import { getVault } from "./vault";
import { getDiscussionStatsForSlugs } from "./talk";
import { tokenize, buildCorpusStats, bm25Score } from "./bm25";
import { searchByVector } from "./embeddings";
import { reciprocalRankFusion } from "./query-search";
import { RRF_K } from "./constants";
import { logger } from "./logger";

export type BrowseSort = "recent" | "confidence" | "sources";

/** Discussion counts for a slug — `{ total, open }` (open ≤ total). */
export type DiscussionStats = Record<string, { total: number; open: number }>;

/** A topic facet: `[tag, count]`. */
export type TagFacet = [string, number];

export interface BrowseOptions {
  /** Lens scope: `"all"` (the public commons) or `"vault:<id>"`. */
  scope?: string;
  /** Restrict to pages carrying this tag (applied before ranking). */
  tag?: string | null;
  /** Facet order when there is no query (ignored when ranking by relevance). */
  sort?: BrowseSort;
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /** Viewer — only used to resolve their readable pages for a vault scope. */
  principal?: Principal | null;
}

export interface BrowseResponse {
  /** The current page's slice of ranked results. */
  results: IndexEntry[];
  /** Total matches across all pages (drives the pagination controls). */
  total: number;
  discussionStats: DiscussionStats;
  /**
   * Tag facets for the rail — counts across the full SCOPE pool (before the tag
   * filter or query), so the topic list stays stable while you search/filter.
   */
  tags: TagFacet[];
}

/** The `/api/wiki/browse` JSON shape: a {@link BrowseResponse} plus the echoed page cursor. */
export interface BrowsePayload extends BrowseResponse {
  page: number;
  pageSize: number;
}

export const BROWSE_PAGE_SIZE = 30;

/**
 * Resolve the candidate pool for a scope. `"all"` → the public commons (already
 * public + non-agent by construction). `"vault:<id>"` → a PUBLIC vault's
 * referenced pages the viewer may read, with agent-scoped pages excluded (the
 * readable set can include the owner's own agent/private pages, the commons
 * cannot — so re-apply the agent filter here).
 */
async function resolveCandidates(
  scope: string,
  principal: Principal | null,
): Promise<IndexEntry[]> {
  if (scope.startsWith("vault:")) {
    const vaultId = scope.slice("vault:".length);
    const vault = await getVault(vaultId);
    if (!vault || vault.visibility !== "public") return [];
    const refs = new Set(vault.slugs);
    return (await listReadableWikiPages(principal))
      .filter((p) => refs.has(p.slug))
      .filter((p) => !isAgentScopedType(p.type));
  }
  return listCommonsPages();
}

function sortEntries(entries: IndexEntry[], sort: BrowseSort): IndexEntry[] {
  return [...entries].sort((a, b) =>
    sort === "confidence"
      ? (b.confidence ?? 0) - (a.confidence ?? 0)
      : sort === "sources"
        ? (b.sourceCount ?? 0) - (a.sourceCount ?? 0)
        : (b.updated ?? "").localeCompare(a.updated ?? ""),
  );
}

/**
 * Rank candidates for a query: BM25 over title+summary (cheap — no per-page disk
 * read) fused with vector similarity via RRF. Pure BM25 when the vector store is
 * empty/unavailable. Returns slugs in relevance order (only pages that matched).
 */
async function hybridRank(q: string, entries: IndexEntry[]): Promise<string[]> {
  const queryTokens = tokenize(q);
  const corpusStats = await buildCorpusStats(entries, { fullBody: false });
  const bm25Results = entries
    .map((e) => ({ slug: e.slug, score: bm25Score(e, queryTokens, corpusStats) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const allowedSlugs = new Set(entries.map((e) => e.slug));
  let vectorResults: Array<{ slug: string; score: number }> = [];
  try {
    // Ask for a generous head so semantic-only matches reach the first result
    // pages; deeper pages still fall back to the full BM25 match set.
    const limit = Math.min(allowedSlugs.size, Math.max(64, BROWSE_PAGE_SIZE * 4));
    const raw = await searchByVector(q, limit);
    vectorResults = raw.filter((r) => allowedSlugs.has(r.slug));
  } catch (err) {
    logger.warn("browse", "vector search failed; ranking by BM25 only:", err);
  }

  const fused =
    vectorResults.length > 0
      ? reciprocalRankFusion(bm25Results, vectorResults, RRF_K)
      : bm25Results;
  return fused.map((r) => r.slug);
}

/**
 * Search/browse the commons (or a vault lens), ranked and paginated server-side.
 * When `query` is non-empty results are ordered by hybrid relevance (the `sort`
 * facet is ignored); otherwise by the chosen facet.
 */
export async function searchCommons(
  query: string | null,
  opts: BrowseOptions = {},
): Promise<BrowseResponse> {
  const scope = opts.scope || "all";
  const principal = opts.principal ?? null;
  const sort = opts.sort ?? "recent";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? BROWSE_PAGE_SIZE));
  const q = query?.trim() || "";

  const pool = await resolveCandidates(scope, principal);

  // Tag facets from the full scope pool — stable while searching/filtering.
  const tagFreq = new Map<string, number>();
  for (const p of pool) for (const t of p.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  const tags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]);

  const tag = opts.tag?.trim() || null;
  const filtered = tag ? pool.filter((p) => (p.tags ?? []).includes(tag)) : pool;

  let ranked: IndexEntry[];
  if (q) {
    const bySlug = new Map(filtered.map((e) => [e.slug, e]));
    const slugs = await hybridRank(q, filtered);
    ranked = slugs
      .map((s) => bySlug.get(s))
      .filter((e): e is IndexEntry => e !== undefined);
  } else {
    ranked = sortEntries(filtered, sort);
  }

  const total = ranked.length;
  const start = (page - 1) * pageSize;
  const slice = ranked.slice(start, start + pageSize);

  const statsMap = await getDiscussionStatsForSlugs(slice.map((p) => p.slug));
  const discussionStats: DiscussionStats = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  return { results: slice, total, discussionStats, tags };
}
