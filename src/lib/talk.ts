// ---------------------------------------------------------------------------
// Talk pages — Phase 2 threaded discussion system (data layer)
// ---------------------------------------------------------------------------
//
// Each wiki page's discussions live in `discuss/<slug>.json` — a JSON file
// containing an array of TalkThread objects. JSON rather than markdown because
// talk pages are structured data (threading, status, IDs) that would be painful
// to round-trip through frontmatter.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import path from "path";
import { getDataDir } from "./config";
import { withFileLock } from "./lock";
import { isEnoent } from "./errors";
import type { TalkThread, TalkComment } from "./types";

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

const DISCUSS_DIR_NAME = "discuss";

/** Returns the discuss directory path. */
export function getDiscussDir(): string {
  return path.join(getDataDir(), DISCUSS_DIR_NAME);
}

/** Creates the `discuss/` directory if it doesn't exist. */
export async function ensureDiscussDir(): Promise<void> {
  await fs.mkdir(getDiscussDir(), { recursive: true });
}

/** Path to the JSON file for a given page's discussions. */
function discussFilePath(pageSlug: string): string {
  return path.join(getDiscussDir(), `${pageSlug}.json`);
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
    const raw = await fs.readFile(discussFilePath(pageSlug), "utf-8");
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
  await ensureDiscussDir();
  await fs.writeFile(discussFilePath(pageSlug), JSON.stringify(threads, null, 2), "utf-8");
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
 */
export async function createThread(
  pageSlug: string,
  title: string,
  author: string,
  body: string,
): Promise<TalkThread> {
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
    return thread;
  });
}

/**
 * Add a comment to an existing thread.
 * Returns the newly created TalkComment.
 * Throws if thread index is out of bounds.
 */
export async function addComment(
  pageSlug: string,
  threadIndex: number,
  author: string,
  body: string,
  parentId?: string,
): Promise<TalkComment> {
  return withFileLock(`discuss:${pageSlug}`, async () => {
    const threads = await readDiscussFile(pageSlug);
    const thread = threads[threadIndex];
    if (!thread) {
      throw new Error(
        `thread index ${threadIndex} not found for page "${pageSlug}"`,
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
    return comment;
  });
}

/**
 * Change a thread's status to "resolved" or "wontfix".
 * Returns the updated TalkThread.
 * Throws if thread index is out of bounds.
 */
export async function resolveThread(
  pageSlug: string,
  threadIndex: number,
  status: "resolved" | "wontfix",
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
    return thread;
  });
}

/**
 * Remove all discussions for a page (called when a wiki page is deleted).
 * No-op if no discussions exist.
 */
export async function deleteDiscussions(pageSlug: string): Promise<void> {
  try {
    await fs.unlink(discussFilePath(pageSlug));
  } catch (err) {
    if (!isEnoent(err)) throw err;
    // File didn't exist — nothing to delete.
  }
}
