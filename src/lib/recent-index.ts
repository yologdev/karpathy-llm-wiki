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

/**
 * The recent-activity list, newest-first — or `null` when the index has never
 * been seeded (caller should fall back to {@link scanTrail}). Distinguishing
 * "absent" (`null`) from "seeded but empty" (`[]`) is what prevents a single
 * write from seeding a misleading partial list.
 */
export async function getRecentIndex(): Promise<TrailEvent[] | null> {
  try {
    const idx = await getStorage().getIndex<TrailEvent[]>(RECENT_KEY);
    if (!Array.isArray(idx)) return null;
    return idx;
  } catch (err) {
    logger.warn("recent-index", "read failed; falling back to scan", err);
    return null;
  }
}

async function putRecentIndex(events: TrailEvent[]): Promise<void> {
  await getStorage().putIndex(RECENT_KEY, events.slice(0, MAX_RECENT));
}

/**
 * Push a new activity event to the front. NO-OP until the index is seeded (the
 * daily rebuild seeds it) — we never fabricate a partial recent list from one
 * write, which would hide all prior activity until the next rebuild.
 */
export async function pushRecentEvent(event: TrailEvent): Promise<void> {
  await withFileLock(RECENT_LOCK, async () => {
    const idx = await getRecentIndex();
    if (idx === null) return; // not seeded yet — daily rebuild will seed it
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
    await putRecentIndex(deduped);
  });
}

/** Drop every event for a slug (page deleted). No-op until seeded. */
export async function removeRecentForSlug(slug: string): Promise<void> {
  await withFileLock(RECENT_LOCK, async () => {
    const idx = await getRecentIndex();
    if (idx === null) return;
    const next = idx.filter((e) => e.slug !== slug);
    if (next.length !== idx.length) await putRecentIndex(next);
  });
}

/** Reconstruct the recent list from the authoritative scan (daily self-heal). */
export async function rebuildRecentIndex(): Promise<number> {
  const events = await scanTrail(MAX_RECENT, null);
  await withFileLock(RECENT_LOCK, async () => {
    await putRecentIndex(events);
  });
  return Math.min(events.length, MAX_RECENT);
}
