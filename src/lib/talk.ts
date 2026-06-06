// ---------------------------------------------------------------------------
// Talk pages — Phase 2 threaded discussion system (data layer)
// ---------------------------------------------------------------------------
//
// Each wiki page's discussions live in `discuss/<slug>.json` — a JSON file
// containing an array of TalkThread objects. JSON rather than markdown because
// talk pages are structured data (threading, status, IDs) that would be painful
// to round-trip through frontmatter.
// ---------------------------------------------------------------------------

import { getStorage } from "./storage";
import { getDataDir } from "./paths";
import { withFileLock } from "./lock";
import { isEnoent } from "./errors";
import { logger } from "./logger";
import type { TalkThread, TalkComment } from "./types";

// ---------------------------------------------------------------------------
// Derived-index hooks (Phase 2 precomputed indexes) — fail-soft. Talk mutations
// bypass the page lifecycle op, so the discuss-stats index AND the contributor
// index are maintained directly here. Dynamic-imported to avoid a circular
// dependency (discuss-stats-index imports talk for the rebuild scan). A failed
// index update must NEVER break the thread/comment write.
// ---------------------------------------------------------------------------

/** Upsert this slug's discussion stats from the in-memory threads array. */
async function syncDiscussStatsHook(
  pageSlug: string,
  threads: TalkThread[],
): Promise<void> {
  try {
    const { syncDiscussStatsForSlug } = await import("./discuss-stats-index");
    await syncDiscussStatsForSlug(pageSlug, threads);
  } catch (err) {
    logger.warn("discuss-stats", `stats sync skipped for "${pageSlug}":`, err);
  }
}

/** Bump the contributor index for a talk comment (and optionally a new thread). */
async function recordTalkContributorHook(
  author: string,
  opts: { comment?: boolean; thread?: boolean; date?: string },
): Promise<void> {
  try {
    const { recordTalkForAuthor } = await import("./contributor-index");
    await recordTalkForAuthor(author, opts);
  } catch (err) {
    logger.warn("contributor-index", `talk contributor bump skipped for "${author}":`, err);
  }
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

const DISCUSS_DIR_NAME = "discuss";

/** Returns the discuss directory path. */
export function getDiscussDir(): string {
  return `${getDataDir()}/${DISCUSS_DIR_NAME}`;
}

/** Creates the `discuss/` directory if it doesn't exist. */
export async function ensureDiscussDir(): Promise<void> {
  /* Storage provider creates parent directories on write — no-op. */
}

/** Storage-relative path for a discuss file. */
function discussRelPath(pageSlug: string): string {
  return `${DISCUSS_DIR_NAME}/${pageSlug}.json`;
}

/** Storage-relative path prefix for discuss files — used by contributors.ts. */
export function getDiscussRelPrefix(): string {
  return DISCUSS_DIR_NAME;
}

// ---------------------------------------------------------------------------
// Monotonic timestamp — ensures unique IDs even within the same millisecond
// ---------------------------------------------------------------------------

let lastTimestamp = 0;

function uniqueTimestamp(): string {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return String(lastTimestamp);
}

/** Reset monotonic timestamp state. **Test-only.** */
export function _resetTimestamp(): void {
  lastTimestamp = 0;
}

// ---------------------------------------------------------------------------
// Internal file I/O helpers
// ---------------------------------------------------------------------------

/** Read and parse the discuss JSON file for a page. Returns [] if not found. */
async function readDiscussFile(pageSlug: string): Promise<TalkThread[]> {
  try {
    const raw = await getStorage().readFile(discussRelPath(pageSlug));
    return JSON.parse(raw) as TalkThread[];
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
}

/** Serialize and write the discuss JSON file for a page. */
async function writeDiscussFile(
  pageSlug: string,
  threads: TalkThread[],
): Promise<void> {
  await getStorage().writeFile(discussRelPath(pageSlug), JSON.stringify(threads, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all threads for a wiki page. Returns empty array if no discussions. */
export async function listThreads(pageSlug: string): Promise<TalkThread[]> {
  return readDiscussFile(pageSlug);
}

/** Get a single thread by index. Returns null if not found. */
export async function getThread(
  pageSlug: string,
  threadIndex: number,
): Promise<TalkThread | null> {
  const threads = await readDiscussFile(pageSlug);
  return threads[threadIndex] ?? null;
}

/**
 * Create a new thread with the first comment.
 * Returns the newly created TalkThread.
 * Throws if title, author, or body are empty or whitespace-only.
 */
export async function createThread(
  pageSlug: string,
  title: string,
  author: string,
  body: string,
): Promise<TalkThread> {
  if (!title || !title.trim()) {
    throw new Error("title must be a non-empty string");
  }
  if (!author || !author.trim()) {
    throw new Error("author must be a non-empty string");
  }
  if (!body || !body.trim()) {
    throw new Error("body must be a non-empty string");
  }
  return withFileLock(`discuss:${pageSlug}`, async () => {
    const threads = await readDiscussFile(pageSlug);
    const now = new Date().toISOString();
    const commentId = uniqueTimestamp();

    const firstComment: TalkComment = {
      id: commentId,
      author,
      created: now,
      body,
      parentId: null,
    };

    const thread: TalkThread = {
      pageSlug,
      title,
      status: "open",
      created: now,
      updated: now,
      comments: [firstComment],
    };

    threads.push(thread);
    await writeDiscussFile(pageSlug, threads);
    // Maintain derived indexes (fail-soft, inside the discuss:<slug> lock):
    // a new thread bumps this slug's stats and the creator's contributor counts.
    await syncDiscussStatsHook(pageSlug, threads);
    await recordTalkContributorHook(author, { comment: true, thread: true, date: now });
    return thread;
  });
}

/**
 * Add a comment to an existing thread.
 * Returns the newly created TalkComment.
 * Throws if author or body are empty or whitespace-only.
 * Throws if thread index is out of bounds.
 */
export async function addComment(
  pageSlug: string,
  threadIndex: number,
  author: string,
  body: string,
  parentId?: string,
): Promise<TalkComment> {
  if (!author || !author.trim()) {
    throw new Error("author must be a non-empty string");
  }
  if (!body || !body.trim()) {
    throw new Error("body must be a non-empty string");
  }
  return withFileLock(`discuss:${pageSlug}`, async () => {
    const threads = await readDiscussFile(pageSlug);
    const thread = threads[threadIndex];
    if (!thread) {
      throw new Error(
        `thread index ${threadIndex} not found for page "${pageSlug}"`,
      );
    }

    if (thread.status === "resolved" || thread.status === "wontfix") {
      throw new Error(
        `Cannot comment on a ${thread.status} thread — reopen it first.`,
      );
    }

    const now = new Date().toISOString();
    const comment: TalkComment = {
      id: uniqueTimestamp(),
      author,
      created: now,
      body,
      parentId: parentId ?? null,
    };

    thread.comments.push(comment);
    thread.updated = now;
    await writeDiscussFile(pageSlug, threads);
    // Maintain derived indexes (fail-soft): open/total are unchanged by a
    // comment, but re-syncing keeps the index self-healing; bump the commenter.
    await syncDiscussStatsHook(pageSlug, threads);
    await recordTalkContributorHook(author, { comment: true, date: now });
    return comment;
  });
}

/**
 * Change a thread's status to "resolved", "wontfix", or "open" (reopen).
 * Returns the updated TalkThread.
 * Throws if thread index is out of bounds.
 */
export async function resolveThread(
  pageSlug: string,
  threadIndex: number,
  status: "open" | "resolved" | "wontfix",
): Promise<TalkThread> {
  return withFileLock(`discuss:${pageSlug}`, async () => {
    const threads = await readDiscussFile(pageSlug);
    const thread = threads[threadIndex];
    if (!thread) {
      throw new Error(
        `thread index ${threadIndex} not found for page "${pageSlug}"`,
      );
    }

    thread.status = status;
    thread.updated = new Date().toISOString();
    await writeDiscussFile(pageSlug, threads);
    // Status change moves the open count → re-sync this slug's stats (fail-soft).
    await syncDiscussStatsHook(pageSlug, threads);
    return thread;
  });
}

// ---------------------------------------------------------------------------
// Discussion stats — lightweight counts for badges and index views
// ---------------------------------------------------------------------------

/** Thread count stats for a single wiki page. */
export interface DiscussionStats {
  /** Total number of threads (any status). */
  total: number;
  /** Number of threads with status "open". */
  open: number;
}

/** Return discussion thread counts for a single page. Lightweight — reads
 *  the JSON file but only counts statuses, doesn't expose full content. */
export async function getDiscussionStats(
  pageSlug: string,
): Promise<DiscussionStats> {
  const threads = await readDiscussFile(pageSlug);
  return {
    total: threads.length,
    open: threads.filter((t) => t.status === "open").length,
  };
}

/**
 * Batch version: return discussion stats for multiple slugs in one pass.
 * Reads the discuss directory once and returns a Map keyed by slug.
 * Slugs with no discussions are included with `{ total: 0, open: 0 }`.
 */
export async function getDiscussionStatsForSlugs(
  slugs: string[],
): Promise<Map<string, DiscussionStats>> {
  const result = new Map<string, DiscussionStats>();

  // Pre-populate with zeros so every requested slug has an entry.
  for (const slug of slugs) {
    result.set(slug, { total: 0, open: 0 });
  }

  // Fast path: project the requested slugs out of the precomputed discuss-stats
  // index (O(1)). Falls through to the directory scan below only when the index
  // is ABSENT (reader → null); an empty-but-present index is authoritative.
  try {
    const { getDiscussStatsIndex } = await import("./discuss-stats-index");
    const idx = await getDiscussStatsIndex();
    if (idx !== null) {
      for (const slug of slugs) {
        const stat = idx[slug];
        if (stat) result.set(slug, { total: stat.total, open: stat.open });
      }
      return result;
    }
  } catch {
    // Fall through to the scan — the index is purely an accelerator.
  }

  // Read directory listing once to find which discuss files exist.
  let files: string[] = [];
  try {
    const entries = await getStorage().listFiles(DISCUSS_DIR_NAME);
    files = entries.map((e) => e.name);
  } catch (err) {
    if (isEnoent(err)) return result; // No discuss dir → all zeros.
    throw err;
  }

  // Build a set of slugs we care about for fast lookup.
  const slugSet = new Set(slugs);

  // Only read files that match a requested slug.
  const promises: Promise<void>[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const slug = file.slice(0, -5); // strip ".json"
    if (!slugSet.has(slug)) continue;

    promises.push(
      readDiscussFile(slug).then((threads) => {
        result.set(slug, {
          total: threads.length,
          open: threads.filter((t) => t.status === "open").length,
        });
      }),
    );
  }

  await Promise.all(promises);
  return result;
}

/**
 * Remove all discussions for a page (called when a wiki page is deleted).
 * No-op if no discussions exist.
 */
export async function deleteDiscussions(pageSlug: string): Promise<void> {
  try {
    await getStorage().deleteFile(discussRelPath(pageSlug));
  } catch (err) {
    if (!isEnoent(err)) throw err;
    // File didn't exist — nothing to delete.
  }
  // Drop this slug's discuss-stats entry (fail-soft).
  try {
    const { removeDiscussStatsForSlug } = await import("./discuss-stats-index");
    await removeDiscussStatsForSlug(pageSlug);
  } catch (err) {
    logger.warn("discuss-stats", `stats remove skipped for "${pageSlug}":`, err);
  }
}
