/**
 * The public **commons** — a derived index of every PUBLIC page across all
 * tenants (tenant-silos groundwork; see yopedia-concept.md). In the per-tenant
 * model each page lives in its owner's silo and the commons is *not* separate
 * storage but this persisted index over the public ones.
 *
 * Phase-1a: the index is *maintained* on the write/delete path but not yet read
 * by any surface (reads still use the flat wiki index) — additive and
 * behavior-preserving. A later phase switches the commons read surfaces over.
 */

import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { listWikiPages, isAgentScopedType, DEFAULT_TENANT } from "./wiki";

/** KV/derived-index key (resolves to `_idx:commons` on R2, a JSON file on fs). */
const COMMONS_KEY = "commons";
/** Single global lock — commons writes are cross-tenant. */
const COMMONS_LOCK = "commons-index";

/** One public page in the commons, addressed by `(tenant, slug)`. */
export interface CommonsEntry {
  tenant: string;
  slug: string;
  title: string;
  summary: string;
  tags?: string[];
  updated?: string;
  sourceCount?: number;
  confidence?: number;
  type?: string;
}

/** A page belongs in the commons iff it's public and not agent-scoped. */
export function belongsInCommons(meta: {
  visibility?: string;
  type?: string;
}): boolean {
  return meta.visibility !== "private" && !isAgentScopedType(meta.type);
}

/** Read the full commons index (empty array when absent). */
export async function getCommonsIndex(): Promise<CommonsEntry[]> {
  const idx = await getStorage().getIndex<CommonsEntry[]>(COMMONS_KEY);
  return Array.isArray(idx) ? idx : [];
}

async function putCommonsIndex(entries: CommonsEntry[]): Promise<void> {
  await getStorage().putIndex(COMMONS_KEY, entries);
}

/** Insert or update a commons entry, keyed by `(tenant, slug)`. */
export async function upsertCommonsEntry(entry: CommonsEntry): Promise<void> {
  await withFileLock(COMMONS_LOCK, async () => {
    const entries = await getCommonsIndex();
    const i = entries.findIndex(
      (e) => e.tenant === entry.tenant && e.slug === entry.slug,
    );
    if (i === -1) entries.push(entry);
    else entries[i] = entry;
    await putCommonsIndex(entries);
  });
}

/** Remove a commons entry (no-op if absent). */
export async function removeCommonsEntry(
  tenant: string,
  slug: string,
): Promise<void> {
  await withFileLock(COMMONS_LOCK, async () => {
    const entries = await getCommonsIndex();
    const next = entries.filter(
      (e) => !(e.tenant === tenant && e.slug === slug),
    );
    if (next.length !== entries.length) await putCommonsIndex(next);
  });
}

/**
 * Remove any commons entry for a slug regardless of tenant. Safe while slugs
 * are globally unique (pre-migration); used by the delete path where the
 * owner may not be readily available.
 */
export async function removeCommonsEntryBySlug(slug: string): Promise<void> {
  await withFileLock(COMMONS_LOCK, async () => {
    const entries = await getCommonsIndex();
    const next = entries.filter((e) => e.slug !== slug);
    if (next.length !== entries.length) await putCommonsIndex(next);
  });
}

/**
 * Sync one page into/out of the commons after a write. Fail-soft: a commons
 * error must never break the underlying page write. `tenant` defaults to the
 * page owner (or {@link DEFAULT_TENANT} when ownerless).
 */
export async function syncCommonsForPage(
  slug: string,
  meta: {
    owner?: string;
    visibility?: string;
    type?: string;
    title: string;
    summary: string;
    tags?: string[];
    updated?: string;
    sourceCount?: number;
    confidence?: number;
  },
): Promise<void> {
  const tenant = meta.owner?.trim() || DEFAULT_TENANT;
  if (belongsInCommons(meta)) {
    await upsertCommonsEntry({
      tenant,
      slug,
      title: meta.title,
      summary: meta.summary,
      tags: meta.tags,
      updated: meta.updated,
      sourceCount: meta.sourceCount,
      confidence: meta.confidence,
      type: meta.type,
    });
  } else {
    await removeCommonsEntry(tenant, slug);
  }
}

/**
 * Rebuild the entire commons index from the current (flat) wiki index. Used by
 * the migration and as a repair tool. Scans every page, keeps the public,
 * non-agent ones, and replaces the stored index in one write.
 */
export async function rebuildCommonsIndex(): Promise<number> {
  const pages = await listWikiPages();
  const entries: CommonsEntry[] = pages
    .filter((p) => belongsInCommons(p))
    .map((p) => ({
      tenant: p.owner?.trim() || DEFAULT_TENANT,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      tags: p.tags,
      updated: p.updated,
      sourceCount: p.sourceCount,
      confidence: p.confidence,
      type: p.type,
    }));
  await withFileLock(COMMONS_LOCK, async () => {
    await putCommonsIndex(entries);
  });
  return entries.length;
}
