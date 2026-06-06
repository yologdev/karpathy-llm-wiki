/**
 * Precomputed **reverse-link** index (Phase 2 — precomputed KV indexes).
 *
 * Shape `Record<targetSlug, sourceSlug[]>` — the source pages that link TO a
 * target. Replaces the per-render O(pages²) scan in {@link findBacklinks} with
 * an O(1) KV read, maintained incrementally by diffing a page's outbound links
 * on each write and rebuilt daily as self-heal.
 *
 * IMPORTANT: only SOURCE SLUGS are stored. Titles and — crucially — visibility
 * are resolved/enforced on READ. The index never encodes who can see what; a
 * private linker is filtered out at read time, so the index can be shared/cached
 * without leaking. Behavior-preserving: the read site falls back to the live
 * O(pages²) scan whenever the index is ABSENT (reader returns `null`). An
 * empty-but-present index (`{}`) is a valid seeded state.
 */

import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { extractWikiLinks } from "./links";
import {
  listWikiPages,
  readWikiPage,
} from "./wiki";
import { logger } from "./logger";

/** KV/derived-index key (`_idx:backlinks`). Shape: `Record<target, source[]>`. */
const BACKLINK_INDEX_KEY = "backlinks";
/** Single global lock — the reverse map is global. */
const BACKLINK_INDEX_LOCK = "backlinks-index";

/** `targetSlug → sourceSlugs that link to it`. */
export type BacklinkIndex = Record<string, string[]>;

/**
 * Read the full backlink index, or `null` when absent/corrupt. Returns `null`
 * (not an empty object) so callers can distinguish "no index → fall back to the
 * live scan" from "index present but empty → genuinely no backlinks". Fail-soft:
 * a missing or corrupt index returns `null`.
 */
export async function getBacklinkIndex(): Promise<BacklinkIndex | null> {
  try {
    const idx = await getStorage().getIndex<BacklinkIndex>(BACKLINK_INDEX_KEY);
    if (!idx || typeof idx !== "object") return null;
    return idx;
  } catch (err) {
    logger.warn("backlink-index", "backlink index unreadable; treating as absent:", err);
    return null;
  }
}

async function putBacklinkIndex(idx: BacklinkIndex): Promise<void> {
  await getStorage().putIndex(BACKLINK_INDEX_KEY, idx);
}

/** Unique outbound link targets in `content` (excludes self-links). */
function outboundTargets(slug: string, content: string): Set<string> {
  const targets = new Set<string>();
  for (const link of extractWikiLinks(content)) {
    if (link.targetSlug && link.targetSlug !== slug) targets.add(link.targetSlug);
  }
  return targets;
}

/**
 * Sync the backlink index for `slug` after a write by diffing its NEW outbound
 * targets against its PREVIOUS ones: for each newly-linked target add `slug`,
 * for each no-longer-linked target remove `slug`. `prevContent` is the page's
 * content before the write (pass `undefined`/`null` for a brand-new page).
 */
export async function syncBacklinksForPage(
  slug: string,
  newContent: string,
  prevContent?: string | null,
): Promise<void> {
  const next = outboundTargets(slug, newContent);
  const prev = prevContent ? outboundTargets(slug, prevContent) : new Set<string>();

  const added: string[] = [];
  const removed: string[] = [];
  for (const t of next) if (!prev.has(t)) added.push(t);
  for (const t of prev) if (!next.has(t)) removed.push(t);
  if (added.length === 0 && removed.length === 0) return;

  await withFileLock(BACKLINK_INDEX_LOCK, async () => {
    const idx = await getBacklinkIndex();
    if (!idx) return; // No index yet → daily rebuild seeds it; don't fabricate one.
    let changed = false;

    for (const target of added) {
      const sources = idx[target] ?? [];
      if (!sources.includes(slug)) {
        sources.push(slug);
        idx[target] = sources;
        changed = true;
      }
    }
    for (const target of removed) {
      const sources = idx[target];
      if (!sources) continue;
      const filtered = sources.filter((s) => s !== slug);
      if (filtered.length !== sources.length) {
        if (filtered.length > 0) idx[target] = filtered;
        else delete idx[target];
        changed = true;
      }
    }

    if (changed) await putBacklinkIndex(idx);
  });
}

/**
 * Remove `slug` from the index entirely on delete: drop its own target key AND
 * remove it as a source from every other target's array.
 */
export async function removeBacklinksForSlug(slug: string): Promise<void> {
  await withFileLock(BACKLINK_INDEX_LOCK, async () => {
    const idx = await getBacklinkIndex();
    if (!idx) return; // No index yet → daily rebuild seeds it; don't fabricate one.
    let changed = false;

    if (slug in idx) {
      delete idx[slug];
      changed = true;
    }
    for (const target of Object.keys(idx)) {
      const sources = idx[target];
      const filtered = sources.filter((s) => s !== slug);
      if (filtered.length !== sources.length) {
        if (filtered.length > 0) idx[target] = filtered;
        else delete idx[target];
        changed = true;
      }
    }

    if (changed) await putBacklinkIndex(idx);
  });
}

/**
 * Rebuild the full reverse-link map in one pass over every page. Repair tool +
 * daily self-heal.
 */
export async function rebuildBacklinkIndex(): Promise<BacklinkIndex> {
  const pages = await listWikiPages();
  const idx: BacklinkIndex = {};
  for (const entry of pages) {
    if (entry.slug === "index" || entry.slug === "log") continue;
    const page = await readWikiPage(entry.slug);
    if (!page) continue;
    for (const target of outboundTargets(entry.slug, page.content)) {
      (idx[target] ??= []).push(entry.slug);
    }
  }
  await withFileLock(BACKLINK_INDEX_LOCK, async () => {
    await putBacklinkIndex(idx);
  });
  return idx;
}
