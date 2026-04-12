import fs from "fs/promises";
import path from "path";
import { getWikiDir, ensureDirectories } from "./wiki";
import { withFileLock } from "./lock";

// ---------------------------------------------------------------------------
// Query history — persist past queries as JSON in the wiki directory
// ---------------------------------------------------------------------------

/** Maximum number of history entries to keep. Oldest are trimmed on append. */
const MAX_HISTORY_ENTRIES = 200;

/** Lock key for serializing reads/writes to the history file. */
const LOCK_KEY = "query-history.json";

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function historyPath(): string {
  return path.join(getWikiDir(), "query-history.json");
}

function generateId(): string {
  // Timestamp-based id with random suffix for uniqueness
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

async function readHistory(): Promise<QueryHistoryEntry[]> {
  try {
    const raw = await fs.readFile(historyPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueryHistoryEntry[];
  } catch {
    // File doesn't exist or is malformed — start fresh
    return [];
  }
}

async function writeHistory(entries: QueryHistoryEntry[]): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(historyPath(), JSON.stringify(entries, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a query to the history file.
 *
 * Uses file locking to prevent TOCTOU races. Trims oldest entries when the
 * history exceeds {@link MAX_HISTORY_ENTRIES}.
 */
export async function appendQuery(
  entry: Omit<QueryHistoryEntry, "id">,
): Promise<QueryHistoryEntry> {
  return withFileLock(LOCK_KEY, async () => {
    const entries = await readHistory();

    const newEntry: QueryHistoryEntry = {
      ...entry,
      id: generateId(),
    };

    entries.push(newEntry);

    // Trim oldest entries if over the cap
    const trimmed =
      entries.length > MAX_HISTORY_ENTRIES
        ? entries.slice(entries.length - MAX_HISTORY_ENTRIES)
        : entries;

    await writeHistory(trimmed);

    return newEntry;
  });
}

/**
 * List past queries, most recent first.
 *
 * @param limit  Maximum entries to return (default: all).
 */
export async function listQueries(
  limit?: number,
): Promise<QueryHistoryEntry[]> {
  const entries = await readHistory();
  const reversed = entries.slice().reverse();
  if (limit !== undefined && limit > 0) {
    return reversed.slice(0, limit);
  }
  return reversed;
}

/**
 * Mark a history entry as saved to a wiki page.
 *
 * @param id    The history entry id.
 * @param slug  The slug of the wiki page it was saved as.
 */
export async function markSaved(id: string, slug: string): Promise<void> {
  await withFileLock(LOCK_KEY, async () => {
    const entries = await readHistory();
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      entry.savedAs = slug;
      await writeHistory(entries);
    }
  });
}
