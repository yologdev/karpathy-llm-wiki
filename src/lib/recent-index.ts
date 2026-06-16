/**
 * `_idx:recent` — a precomputed list of the most recent public activity events
 * (the homepage Trail). Replaces `getTrail`'s O(pages) scan with one KV read.
 *
 * Mirrors the other derived indexes (see `commons.ts`): fail-soft reader that
 * returns `null` when the key is ABSENT (so reads fall back to the scan), an
 * incremental push that NO-OPS until a rebuild seeds it (never fabricate a
 * partial recent list from a single write), and a `rebuildRecentIndex()` that
 * reconstructs the list from the authoritative {@link scanTrail}. Visibility is
 * baked in by building from public pages only — `getTrail` serves this to
 * anonymous readers, and signed-in readers scan instead.
 */
import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { logger } from "./logger";
import { scanTrail, type TrailEvent } from "./trail";

const RECENT_KEY = "recent";
const RECENT_LOCK = "recent-index";
/** How many events to retain — comfortably over-fills the ~10-12 the UI shows. */
const MAX_RECENT = 60;
/** Collapse near-duplicate events (same actor+action+page within ~2 min). */
const DEDUP_WINDOW_MS = 120_000;

// Two flavors share one set of machinery: the GLOBAL list (`recent`, the
// homepage Trail) and PER-OWNER lists (`recent:<tenant>`, each owner's profile
// trail). A per-owner list is the O(1) read that replaces the profile's
// O(pages × revisions) scan — lazily seeded on first profile view and kept fresh
// by the same push/remove below (every write already carries the page's
// `tenant`). `tenant` undefined ⇒ the global list.
function recentKey(tenant?: string): string {
  return tenant ? `${RECENT_KEY}:${tenant}` : RECENT_KEY;
}
function recentLock(tenant?: string): string {
  return tenant ? `${RECENT_LOCK}:${tenant}` : RECENT_LOCK;
}

/**
 * The recent-activity list, newest-first — global, or for one `tenant`. `null`
 * when that index has never been seeded (caller should fall back to a scan).
 * Distinguishing "absent" (`null`) from "seeded but empty" (`[]`) is what
 * prevents a single write from seeding a misleading partial list.
 */
export async function getRecentIndex(tenant?: string): Promise<TrailEvent[] | null> {
  try {
    const idx = await getStorage().getIndex<TrailEvent[]>(recentKey(tenant));
    if (!Array.isArray(idx)) return null;
    return idx;
  } catch (err) {
    logger.warn("recent-index", `read failed (${tenant ?? "global"}); falling back to scan`, err);
    return null;
  }
}

/**
 * Seed/overwrite an index (global or per-`tenant`) — used by the global daily
 * rebuild and the per-owner lazy seed. Capped at {@link MAX_RECENT}.
 */
export async function putRecentIndex(events: TrailEvent[], tenant?: string): Promise<void> {
  await getStorage().putIndex(recentKey(tenant), events.slice(0, MAX_RECENT));
}

/**
 * Push a new activity event to the front. NO-OP until the index is seeded (the
 * daily rebuild seeds it) — we never fabricate a partial recent list from one
 * write, which would hide all prior activity until the next rebuild.
 */
/** Push `event` to the front of ONE index (global or per-tenant). No-op until
 *  that index is seeded — we never fabricate a partial list from a single write. */
async function pushToIndex(tenant: string | undefined, event: TrailEvent): Promise<void> {
  await withFileLock(recentLock(tenant), async () => {
    const idx = await getRecentIndex(tenant);
    if (idx === null) return; // not seeded yet
    const deduped = idx.filter(
      (d) =>
        !(
          d.slug === event.slug &&
          d.actor === event.actor &&
          d.action === event.action &&
          Math.abs(d.ts - event.ts) < DEDUP_WINDOW_MS
        ),
    );
    deduped.unshift(event);
    deduped.sort((a, b) => b.ts - a.ts);
    await putRecentIndex(deduped, tenant);
  });
}

/**
 * Push a new activity event to BOTH the global list and the page-owner's
 * per-tenant list. Each NO-OPS until its own index is seeded (the daily rebuild
 * seeds the global one; the first profile view seeds the per-owner one), so we
 * never fabricate a partial list that would hide all prior activity.
 */
export async function pushRecentEvent(event: TrailEvent): Promise<void> {
  await pushToIndex(undefined, event);
  if (event.tenant) await pushToIndex(event.tenant, event);
}

/** Drop every event for a slug from ONE index. No-op until seeded. */
async function removeFromIndex(tenant: string | undefined, slug: string): Promise<void> {
  await withFileLock(recentLock(tenant), async () => {
    const idx = await getRecentIndex(tenant);
    if (idx === null) return;
    const next = idx.filter((e) => e.slug !== slug);
    if (next.length !== idx.length) await putRecentIndex(next, tenant);
  });
}

/**
 * Drop every event for a slug (page deleted) from the global list and, when the
 * owner's `tenant` is known, that owner's per-tenant list. No-op until seeded.
 */
export async function removeRecentForSlug(slug: string, tenant?: string): Promise<void> {
  await removeFromIndex(undefined, slug);
  if (tenant) await removeFromIndex(tenant, slug);
}

/** Reconstruct the recent list from the authoritative scan (daily self-heal). */
export async function rebuildRecentIndex(): Promise<number> {
  const events = await scanTrail(MAX_RECENT, null);
  await withFileLock(RECENT_LOCK, async () => {
    await putRecentIndex(events);
  });
  return Math.min(events.length, MAX_RECENT);
}
