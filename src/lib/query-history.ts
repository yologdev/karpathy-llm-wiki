import {
  wikiRelPath,
  ensureDirectories,
  tenantForOwner,
  validateTenant,
} from "./wiki";
import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { isEnoent } from "./errors";
import { logger } from "./logger";
import type { QueryFormat } from "./query-format";

// ---------------------------------------------------------------------------
// Query history — per-asker, persisted INSIDE the asker's tenant silo.
// ---------------------------------------------------------------------------
//
// Each asker's history lives at `tenants/<tenant>/query-history.json`, keyed by
// the same canonical identity (`tenantForOwner`) as their pages/raw/discuss.
// Two consequences:
//   * Privacy is **physical** — a reader only ever touches one tenant's file;
//     there is no shared store to over-read, and the route only ever passes the
//     session-derived handle (no client-supplied owner).
//   * It lives in the user's folder, so **account deletion removes it for free**
//     (`deleteTenant` wipes the whole `tenants/<tenant>/` prefix) — a query
//     answer can quote the asker's private pages, so it must not orphan.
//
// It is NOT a vault (no page references, not browseable) and NOT part of the
// page-based export.
//
// Migration: legacy locations (the original shared `wiki/query-history.json` and
// the interim per-owner `wiki/query-history/<key>.json` files) are consolidated
// into the silo on first access, then removed. Owner-less entries are dropped
// (they were already unreadable).

/** Maximum number of history entries to keep PER OWNER. Oldest trimmed on append. */
const MAX_HISTORY_ENTRIES = 200;

/** Legacy shared single-file store (pre per-owner). Migrated then removed. */
const LEGACY_SHARED_FILENAME = "query-history.json";
/** Lock serializing edits to the legacy shared file during migration. */
const LEGACY_SHARED_LOCK = "query-history-legacy";

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
  /** Owner handle — the asker. Resolved to a tenant for storage placement. */
  owner?: string;
  /**
   * Answer format the entry was generated in. Persisted so a restored "html"
   * answer re-renders in the sandboxed iframe rather than as escaped markdown.
   * Absent on legacy entries — treat as "prose".
   */
  format?: QueryFormat;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Storage-relative path to an owner's history file inside their tenant silo. */
function historyRelPathFor(owner: string): string {
  const tenant = tenantForOwner(owner);
  validateTenant(tenant);
  return `tenants/${tenant}/query-history.json`;
}

/** Per-owner (per-tenant) lock key. */
function lockFor(owner: string): string {
  return `query-history:${tenantForOwner(owner)}`;
}

/** Interim per-owner file key (PR #493) — only used to locate files for migration. */
function legacyOwnerKey(owner: string): string {
  return owner
    .toLowerCase()
    .replace(/[^a-z0-9_-]|~/g, (c) => `~${c.charCodeAt(0).toString(16)}`);
}

function generateId(): string {
  // Timestamp-based id with random suffix for uniqueness
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

/**
 * Read a LEGACY history file for migration. Absent → []. A transient read error
 * → [] + warn (defer migration to the next access). An UNPARSEABLE file is
 * quarantined to `<path>.corrupt` and removed (so the per-request migration probe
 * stops re-firing forever) and surfaced at `error` — a human may want to recover
 * it. Returns [] in every non-happy case so a corrupt/missing legacy file never
 * blocks the silo write.
 */
async function readLegacyHistory(relPath: string): Promise<QueryHistoryEntry[]> {
  const storage = getStorage();
  let raw: string;
  try {
    raw = await storage.readFile(relPath);
  } catch (err: unknown) {
    if (!isEnoent(err)) {
      logger.warn("query-history", `legacy read ${relPath} failed:`, err);
    }
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueryHistoryEntry[]) : [];
  } catch (err) {
    logger.error("query-history", `legacy ${relPath} unparseable; quarantining:`, err);
    try {
      await storage.writeFile(`${relPath}.corrupt`, raw);
      await storage.deleteFile(relPath);
    } catch (qerr) {
      logger.error("query-history", `quarantine ${relPath} failed:`, qerr);
    }
    return [];
  }
}

/**
 * Read an owner's silo history file. A genuinely absent file (ENOENT) → `[]`. A
 * REAL failure (transient storage error, or a corrupt/unparseable file) is
 * RETHROWN — a read-modify-write caller must never overwrite real history with an
 * empty list because a read transiently failed. {@link listQueries} (a pure read)
 * downgrades a throw to `[]` for that one request.
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

async function deleteSafe(relPath: string): Promise<void> {
  try {
    await getStorage().deleteFile(relPath);
  } catch (err) {
    if (!isEnoent(err)) {
      logger.warn("query-history", `delete ${relPath} failed:`, err);
    }
  }
}

function trimToCap(entries: QueryHistoryEntry[]): QueryHistoryEntry[] {
  return entries.length > MAX_HISTORY_ENTRIES
    ? entries.slice(entries.length - MAX_HISTORY_ENTRIES)
    : entries;
}

/**
 * Consolidate an owner's history from the legacy locations into their tenant
 * silo, then remove the legacy copies. Idempotent (dedupe by id) and loss-safe
 * (silo is written BEFORE legacy is cleared, so a cleanup failure just re-merges
 * next time). Cheap once done — both legacy probes miss. A silo/legacy WRITE
 * failure propagates (it gates the cleanup, keeping migration loss-safe); a
 * transient legacy READ just defers migration to the next access.
 */
async function migrateLegacyHistory(owner: string): Promise<void> {
  const storage = getStorage();
  const sharedPath = wikiRelPath(LEGACY_SHARED_FILENAME);
  const perOwnerPath = wikiRelPath(`query-history/${legacyOwnerKey(owner)}.json`);

  const [sharedExists, perOwnerExists] = await Promise.all([
    storage.fileExists(sharedPath),
    storage.fileExists(perOwnerPath),
  ]);
  if (!sharedExists && !perOwnerExists) return;

  // Gather legacy entries for THIS owner (shared older than the interim files).
  const sharedOwner = sharedExists
    ? (await readLegacyHistory(sharedPath)).filter((e) => e.owner === owner)
    : [];
  const perOwner = perOwnerExists ? await readLegacyHistory(perOwnerPath) : [];

  // 1. Merge into the silo first (so nothing is lost if cleanup later fails).
  await withFileLock(lockFor(owner), async () => {
    const silo = await readOwnerHistory(owner);
    // Dedupe by id against the silo AND across the two sources (the same id can
    // appear in both if a #493 split left the shared file in place).
    const seen = new Set(silo.map((e) => e.id));
    const incoming: QueryHistoryEntry[] = [];
    for (const e of [...sharedOwner, ...perOwner]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      incoming.push(e);
    }
    if (incoming.length > 0) {
      await writeOwnerHistory(owner, trimToCap([...incoming, ...silo]));
    }
    if (perOwnerExists) await deleteSafe(perOwnerPath);
  });

  // 2. Prune the shared file (after the silo write): drop this owner's entries
  //    AND any owner-less ones (already unreadable), so it eventually empties and
  //    is deleted. Done in a SEPARATE lock (not nested) to avoid cross-lock
  //    ordering. The `rest.length === all.length` guard skips a needless rewrite.
  if (sharedExists) {
    await withFileLock(LEGACY_SHARED_LOCK, async () => {
      const all = await readLegacyHistory(sharedPath);
      const rest = all.filter((e) => e.owner && e.owner !== owner);
      if (rest.length === all.length) return;
      if (rest.length === 0) await deleteSafe(sharedPath);
      else await storage.writeFile(sharedPath, JSON.stringify(rest, null, 2));
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a query to the asker's history file. Uses a per-owner lock to prevent
 * TOCTOU races and trims to {@link MAX_HISTORY_ENTRIES}. An owner-less entry is
 * returned (for the client's optimistic UI) but NOT persisted — anonymous
 * history is unreadable anyway. A real read failure propagates rather than
 * overwriting existing history (see {@link readOwnerHistory}).
 */
export async function appendQuery(
  entry: Omit<QueryHistoryEntry, "id">,
): Promise<QueryHistoryEntry> {
  const newEntry: QueryHistoryEntry = { ...entry, id: generateId() };
  if (!entry.owner) return newEntry;
  const owner = entry.owner;

  await migrateLegacyHistory(owner);
  await withFileLock(lockFor(owner), async () => {
    const entries = await readOwnerHistory(owner);
    entries.push(newEntry);
    await writeOwnerHistory(owner, trimToCap(entries));
  });
  return newEntry;
}

/**
 * List the asker's past queries, most recent first. Reads ONLY the owner's silo
 * file; an anonymous caller (no owner) gets nothing — privacy is enforced by
 * which file is read, not by a post-read filter. A read failure degrades to `[]`
 * for this one request (a pure read can't lose data).
 */
export async function listQueries(
  limit?: number,
  owner?: string | null,
): Promise<QueryHistoryEntry[]> {
  if (!owner) return [];
  await migrateLegacyHistory(owner);
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
  await migrateLegacyHistory(owner);
  await withFileLock(lockFor(owner), async () => {
    const entries = await readOwnerHistory(owner);
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      entry.savedAs = slug;
      await writeOwnerHistory(owner, entries);
    }
  });
}
