import { wikiRelPath, ensureDirectories } from "./wiki";
import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { isEnoent } from "./errors";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Query history — per-asker, persisted as one JSON file PER OWNER.
// ---------------------------------------------------------------------------
//
// Privacy is **physical**: each asker's history lives in its own file
// (`query-history/<ownerKey>.json`), so there is no shared store to accidentally
// over-read — a reader can only ever touch the file for the owner it was given,
// and `ownerKey` is an INJECTIVE, path-safe encoding (distinct owners never
// collide and never produce an empty/shared key). (A query answer may quote the
// asker's own private pages, so history must never be served cross-user.) The
// legacy single `query-history.json` is migrated into per-owner files on first
// access, then deleted; entries with no owner are dropped (already unreadable).

/** Maximum number of history entries to keep PER OWNER. Oldest trimmed on append. */
const MAX_HISTORY_ENTRIES = 200;

/** Legacy single-file store, migrated to per-owner files then removed. */
const LEGACY_FILENAME = "query-history.json";
/** Where an unparseable legacy file is quarantined (so migration stops retrying). */
const LEGACY_CORRUPT_FILENAME = "query-history.json.corrupt";
/** Lock serializing the one-time legacy → per-owner migration. */
const LEGACY_LOCK = "query-history-legacy";

export interface QueryHistoryEntry {
  /** Unique id (timestamp-based). */
  id: string;
  /** The user's question. */
  question: string;
  /** The LLM answer. */
  answer: string;
  /** Cited wiki page slugs. */
  sources: string[];
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Slug of the wiki page if the answer was saved. */
  savedAs?: string;
  /** Owner handle — the asker. Determines which per-owner file the entry lives in. */
  owner?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encode an owner handle into a path-safe file segment.
 *
 * Lowercased to match the app's canonical identity (same normalization as
 * `tenantForOwner`), then any character outside `[a-z0-9_-]` — and the `~`
 * marker itself — is escaped as `~<hex>`. This is **injective**: distinct
 * owners map to distinct keys (no `al.ice`/`alice` collision), it can never be
 * empty for a non-empty owner, and path-traversal bytes (`/`, `.`) are escaped.
 */
function ownerKey(owner: string): string {
  return owner
    .toLowerCase()
    .replace(/[^a-z0-9_-]|~/g, (c) => `~${c.charCodeAt(0).toString(16)}`);
}

/** Per-owner history file path. */
function historyRelPathFor(owner: string): string {
  return wikiRelPath(`query-history/${ownerKey(owner)}.json`);
}

/** Per-owner lock key. */
function lockFor(owner: string): string {
  return `query-history:${ownerKey(owner)}`;
}

function generateId(): string {
  // Timestamp-based id with random suffix for uniqueness
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/**
 * Read an owner's history file. A genuinely absent file (ENOENT) → `[]`. A REAL
 * failure (transient storage error, or a corrupt/unparseable file) is RETHROWN —
 * a read-modify-write caller must never overwrite real history with an empty list
 * because a read transiently failed. {@link listQueries} (a pure read) downgrades
 * a throw to `[]` for that one request.
 */
async function readOwnerHistory(owner: string): Promise<QueryHistoryEntry[]> {
  const relPath = historyRelPathFor(owner);
  try {
    const raw = await getStorage().readFile(relPath);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueryHistoryEntry[]) : [];
  } catch (err: unknown) {
    if (isEnoent(err)) return [];
    logger.error("query-history", `read ${relPath} failed:`, err);
    throw err;
  }
}

async function writeOwnerHistory(
  owner: string,
  entries: QueryHistoryEntry[],
): Promise<void> {
  await ensureDirectories();
  await getStorage().writeFile(
    historyRelPathFor(owner),
    JSON.stringify(entries, null, 2),
  );
}

function trimToCap(entries: QueryHistoryEntry[]): QueryHistoryEntry[] {
  return entries.length > MAX_HISTORY_ENTRIES
    ? entries.slice(entries.length - MAX_HISTORY_ENTRIES)
    : entries;
}

/**
 * One-time, lossless migration from the shared `query-history.json` to per-owner
 * files. Idempotent and cheap once done — the legacy file is deleted, so the
 * existence probe short-circuits without taking the lock. Owner-less entries are
 * dropped (they were never returned to anyone). Resilient by design: it never
 * throws (callers shouldn't break on a migration hiccup), it only deletes the
 * legacy file once EVERY owner migrated (a per-owner failure → retry next time,
 * the dedupe-by-id keeps that idempotent), and an unparseable legacy file is
 * quarantined so the probe stops firing forever.
 */
async function migrateLegacyHistory(): Promise<void> {
  const storage = getStorage();
  const legacyPath = wikiRelPath(LEGACY_FILENAME);

  // Cheap probe: once migrated the file is gone → ENOENT → return un-locked. A
  // transient probe failure just skips this round (the next request retries).
  try {
    await storage.readFile(legacyPath);
  } catch (err) {
    if (!isEnoent(err)) logger.warn("query-history", "legacy probe failed:", err);
    return;
  }

  await withFileLock(LEGACY_LOCK, async () => {
    // Re-read under the lock — another request may have just migrated + deleted.
    let raw: string;
    try {
      raw = await storage.readFile(legacyPath);
    } catch (err) {
      if (!isEnoent(err)) logger.warn("query-history", "legacy reread failed:", err);
      return; // gone (already migrated) or transient → retry next request
    }

    let entries: QueryHistoryEntry[];
    try {
      const parsed = JSON.parse(raw);
      entries = Array.isArray(parsed) ? (parsed as QueryHistoryEntry[]) : [];
    } catch (err) {
      // Unparseable legacy file: quarantine it (so the probe stops re-firing
      // every request) and surface loudly — a human may want to recover it.
      logger.error("query-history", "legacy file unparseable; quarantining:", err);
      try {
        await storage.writeFile(wikiRelPath(LEGACY_CORRUPT_FILENAME), raw);
        await storage.deleteFile(legacyPath);
      } catch (qerr) {
        logger.error("query-history", "legacy quarantine failed:", qerr);
      }
      return;
    }

    // Group by owner; owner-less entries are intentionally dropped.
    const byOwner = new Map<string, QueryHistoryEntry[]>();
    for (const e of entries) {
      if (!e.owner) continue;
      const arr = byOwner.get(e.owner) ?? [];
      arr.push(e);
      byOwner.set(e.owner, arr);
    }

    // Merge each owner's legacy entries into their file (legacy first = older).
    // The dedupe-by-id keeps this idempotent if migration re-runs (e.g. after a
    // failed delete) — preserved legacy ids are already present and skipped.
    let allMigrated = true;
    for (const [owner, legacyEntries] of byOwner) {
      try {
        await withFileLock(lockFor(owner), async () => {
          const existing = await readOwnerHistory(owner); // strict: throws on real failure
          const seen = new Set(existing.map((e) => e.id));
          const merged = [
            ...legacyEntries.filter((e) => !seen.has(e.id)),
            ...existing,
          ];
          await writeOwnerHistory(owner, trimToCap(merged));
        });
      } catch (err) {
        allMigrated = false;
        logger.error("query-history", `migrate owner "${owner}" failed; will retry:`, err);
      }
    }

    // Only drop the shared file once every owner migrated — otherwise leave it
    // for a retry (re-merge is idempotent via the id dedupe above).
    if (!allMigrated) return;
    try {
      await storage.deleteFile(legacyPath);
    } catch (err) {
      if (!isEnoent(err)) logger.error("query-history", "legacy delete failed:", err);
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a query to the asker's history file. Uses a per-owner lock to prevent
 * TOCTOU races and trims to {@link MAX_HISTORY_ENTRIES}. An owner-less entry is
 * returned (for the client's optimistic UI) but NOT persisted — anonymous
 * history is unreadable anyway, and there is no shared file to write it to.
 *
 * A real read failure propagates rather than overwriting existing history with a
 * single-entry file (see {@link readOwnerHistory}).
 */
export async function appendQuery(
  entry: Omit<QueryHistoryEntry, "id">,
): Promise<QueryHistoryEntry> {
  const newEntry: QueryHistoryEntry = { ...entry, id: generateId() };
  if (!entry.owner) return newEntry;
  const owner = entry.owner;

  await migrateLegacyHistory();
  await withFileLock(lockFor(owner), async () => {
    const entries = await readOwnerHistory(owner);
    entries.push(newEntry);
    await writeOwnerHistory(owner, trimToCap(entries));
  });
  return newEntry;
}

/**
 * List the asker's past queries, most recent first. Reads ONLY the owner's file;
 * an anonymous caller (no owner) gets nothing — privacy is enforced by which file
 * is read, not by a post-read filter. A read failure degrades to `[]` for this
 * one request (a pure read can't lose data).
 */
export async function listQueries(
  limit?: number,
  owner?: string | null,
): Promise<QueryHistoryEntry[]> {
  if (!owner) return [];
  await migrateLegacyHistory();
  let entries: QueryHistoryEntry[];
  try {
    entries = await readOwnerHistory(owner);
  } catch (err) {
    logger.warn("query-history", "listQueries read failed; returning empty:", err);
    return [];
  }
  const reversed = entries.slice().reverse();
  return limit !== undefined && limit > 0 ? reversed.slice(0, limit) : reversed;
}

/**
 * Mark one of the asker's history entries as saved to a wiki page. Reads only
 * the owner's file, so an id belonging to a different owner is simply absent
 * (no cross-owner mutation possible).
 */
export async function markSaved(
  id: string,
  slug: string,
  owner?: string | null,
): Promise<void> {
  if (!owner) return;
  await migrateLegacyHistory();
  await withFileLock(lockFor(owner), async () => {
    const entries = await readOwnerHistory(owner);
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      entry.savedAs = slug;
      await writeOwnerHistory(owner, entries);
    }
  });
}
