/**
 * Precomputed **discussion-stats** index (Phase 2 — precomputed KV indexes).
 *
 * Shape `Record<slug, { total: number; open: number }>`. Replaces the per-render
 * `discuss/` directory scan in {@link getDiscussionStatsForSlugs} with an O(1)
 * KV read. Maintained incrementally directly from `talk.ts` (talk mutations
 * bypass the page lifecycle op), and rebuilt daily as self-heal.
 *
 * Behavior-preserving: the read site falls back to the live directory scan
 * whenever the index is ABSENT (reader returns `null`). An empty-but-present
 * index (`{}`) is a valid seeded state.
 */

import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { getDiscussRelPrefix } from "./talk";
import { isEnoent } from "./errors";
import { logger } from "./logger";
import type { TalkThread } from "./types";

/** KV/derived-index key (`_idx:discuss-stats`). */
const DISCUSS_STATS_KEY = "discuss-stats";
/** Single global lock — the stats map is global. */
const DISCUSS_STATS_LOCK = "discuss-stats-index";

/** Per-slug discussion counts. */
export interface DiscussStat {
  total: number;
  open: number;
}

/** `slug → { total, open }`. */
export type DiscussStatsIndex = Record<string, DiscussStat>;

/**
 * Read the full discuss-stats index, or `null` when absent/corrupt. Returns
 * `null` (not an empty object) so callers can distinguish "no index → fall back
 * to the live directory scan" from "index present but empty → genuinely no
 * discussions". Fail-soft: a missing or corrupt index returns `null`.
 */
export async function getDiscussStatsIndex(): Promise<DiscussStatsIndex | null> {
  try {
    const idx = await getStorage().getIndex<DiscussStatsIndex>(DISCUSS_STATS_KEY);
    if (!idx || typeof idx !== "object") return null;
    return idx;
  } catch (err) {
    logger.warn("discuss-stats", "discuss-stats index unreadable; treating as absent:", err);
    return null;
  }
}

async function putDiscussStatsIndex(idx: DiscussStatsIndex): Promise<void> {
  await getStorage().putIndex(DISCUSS_STATS_KEY, idx);
}

/** Count `{ total, open }` from an in-memory threads array. */
export function statsFromThreads(threads: TalkThread[]): DiscussStat {
  return {
    total: threads.length,
    open: threads.filter((t) => t.status === "open").length,
  };
}

/**
 * Upsert one slug's stats. Called from `talk.ts` mutations with the in-memory
 * threads array already held under the `discuss:<slug>` lock. Fail-soft is the
 * caller's responsibility.
 */
export async function syncDiscussStatsForSlug(
  slug: string,
  threads: TalkThread[],
): Promise<void> {
  const stat = statsFromThreads(threads);
  await withFileLock(DISCUSS_STATS_LOCK, async () => {
    const idx = await getDiscussStatsIndex();
    if (!idx) return; // No index yet → daily rebuild seeds it; don't fabricate one.
    const cur = idx[slug];
    if (cur && cur.total === stat.total && cur.open === stat.open) return;
    idx[slug] = stat;
    await putDiscussStatsIndex(idx);
  });
}

/** Remove a slug's stats entry (page/discussions deleted). */
export async function removeDiscussStatsForSlug(slug: string): Promise<void> {
  await withFileLock(DISCUSS_STATS_LOCK, async () => {
    const idx = await getDiscussStatsIndex();
    if (!idx) return; // No index yet → daily rebuild seeds it; don't fabricate one.
    if (!(slug in idx)) return;
    delete idx[slug];
    await putDiscussStatsIndex(idx);
  });
}

/**
 * Rebuild the entire discuss-stats index from a full `discuss/` scan. Repair
 * tool + daily self-heal. Mirrors today's directory-scan logic.
 */
export async function rebuildDiscussStatsIndex(): Promise<DiscussStatsIndex> {
  const prefix = getDiscussRelPrefix();
  const storage = getStorage();
  const idx: DiscussStatsIndex = {};

  let files: string[] = [];
  try {
    const entries = await storage.listFiles(prefix);
    files = entries.map((e) => e.name);
  } catch (err) {
    if (!isEnoent(err)) throw err;
    files = [];
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const slug = file.slice(0, -5);
    try {
      const raw = await storage.readFile(`${prefix}/${file}`);
      const threads = JSON.parse(raw) as TalkThread[];
      if (Array.isArray(threads)) idx[slug] = statsFromThreads(threads);
    } catch {
      // Malformed file — skip silently (mirrors loadAllThreads).
    }
  }

  await withFileLock(DISCUSS_STATS_LOCK, async () => {
    await putDiscussStatsIndex(idx);
  });
  return idx;
}
