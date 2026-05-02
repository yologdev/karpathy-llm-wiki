// ---------------------------------------------------------------------------
// Contributor profiles — Phase 2 trust and attribution (data layer)
// ---------------------------------------------------------------------------
//
// Aggregates activity from two data sources:
//   1. Revision history — edits and page counts
//   2. Talk page discussions — comments and threads created
//
// This is an O(pages × revisions) scan. Fine for small wikis.
// Caching can come later.
// ---------------------------------------------------------------------------

import fs from "fs/promises";
import { listWikiPages } from "./wiki";
import { listRevisions } from "./revisions";
import { getDiscussDir } from "./talk";
import { isEnoent } from "./errors";
import type { ContributorProfile, TalkThread } from "./types";

// ---------------------------------------------------------------------------
// Internal: scan discuss directory for all thread files
// ---------------------------------------------------------------------------

/** Read and parse all discuss JSON files. Returns an array of TalkThread[]. */
async function loadAllThreads(): Promise<TalkThread[]> {
  const dir = getDiscussDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const all: TalkThread[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(`${dir}/${file}`, "utf-8");
      const threads = JSON.parse(raw) as TalkThread[];
      if (Array.isArray(threads)) {
        all.push(...threads);
      }
    } catch {
      // Malformed file — skip silently.
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Internal: aggregate raw activity data
// ---------------------------------------------------------------------------

interface AuthorActivity {
  editCount: number;
  pagesEdited: Set<string>;
  commentCount: number;
  threadsCreated: number;
  dates: string[];
}

function emptyActivity(): AuthorActivity {
  return {
    editCount: 0,
    pagesEdited: new Set(),
    commentCount: 0,
    threadsCreated: 0,
    dates: [],
  };
}

/** Collect all revision-based activity keyed by author handle. */
async function scanRevisions(): Promise<Map<string, AuthorActivity>> {
  const map = new Map<string, AuthorActivity>();
  const pages = await listWikiPages();

  for (const page of pages) {
    const revisions = await listRevisions(page.slug);
    for (const rev of revisions) {
      if (!rev.author) continue;
      let act = map.get(rev.author);
      if (!act) {
        act = emptyActivity();
        map.set(rev.author, act);
      }
      act.editCount++;
      act.pagesEdited.add(rev.slug);
      act.dates.push(rev.date);
    }
  }

  return map;
}

/** Merge talk-page activity into an existing activity map. */
function mergeTalkActivity(
  map: Map<string, AuthorActivity>,
  threads: TalkThread[],
): void {
  for (const thread of threads) {
    for (let i = 0; i < thread.comments.length; i++) {
      const comment = thread.comments[i];
      let act = map.get(comment.author);
      if (!act) {
        act = emptyActivity();
        map.set(comment.author, act);
      }
      act.commentCount++;
      act.dates.push(comment.created);

      // The first comment (index 0) is the thread creator.
      if (i === 0) {
        act.threadsCreated++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Revert detection
// ---------------------------------------------------------------------------

/** Size reduction threshold — a revision must shrink the previous content by
 *  more than this fraction to count as a revert. */
const REVERT_SIZE_REDUCTION_THRESHOLD = 0.5;

/**
 * Scan all revisions across all pages and detect "reverts" — cases where
 * revision N+1 by author B substantially reduces the content of revision N
 * by author A (>50% size reduction).
 *
 * Returns a map from author handle → number of times their content was reverted.
 */
async function detectReverts(): Promise<Map<string, number>> {
  const revertCounts = new Map<string, number>();
  const pages = await listWikiPages();

  for (const page of pages) {
    const revisions = await listRevisions(page.slug);
    if (revisions.length < 2) continue;

    // listRevisions returns newest-first; we need chronological order.
    const chronological = revisions.slice().reverse();

    for (let i = 0; i < chronological.length - 1; i++) {
      const current = chronological[i];
      const next = chronological[i + 1];

      // Both revisions must have authors, and they must be different.
      if (!current.author || !next.author) continue;
      if (current.author === next.author) continue;

      // Check if the next revision substantially reduced the content size.
      if (current.sizeBytes === 0) continue;
      const reduction = (current.sizeBytes - next.sizeBytes) / current.sizeBytes;
      if (reduction > REVERT_SIZE_REDUCTION_THRESHOLD) {
        const count = revertCounts.get(current.author) ?? 0;
        revertCounts.set(current.author, count + 1);
      }
    }
  }

  return revertCounts;
}

// ---------------------------------------------------------------------------
// Trust score
// ---------------------------------------------------------------------------

/** Compute trust score from activity counts and revert rate.
 *  Formula: min(1, (editCount + commentCount) / 50) * (1 - min(0.5, revertCount * 0.1))
 *  Each revert reduces trust by 10%, capped at 50% reduction. */
function computeTrustScore(editCount: number, commentCount: number, revertCount: number): number {
  const activityScore = Math.min(1, (editCount + commentCount) / 50);
  const revertPenalty = 1 - Math.min(0.5, revertCount * 0.1);
  return activityScore * revertPenalty;
}

// ---------------------------------------------------------------------------
// Profile builder
// ---------------------------------------------------------------------------

function buildProfileFromActivity(
  handle: string,
  act: AuthorActivity,
  revertCount: number,
): ContributorProfile {
  // Sort dates chronologically to find first/last.
  const sorted = act.dates.slice().sort();
  const firstSeen = sorted.length > 0 ? sorted[0] : new Date(0).toISOString();
  const lastSeen =
    sorted.length > 0 ? sorted[sorted.length - 1] : new Date(0).toISOString();

  return {
    handle,
    editCount: act.editCount,
    pagesEdited: act.pagesEdited.size,
    commentCount: act.commentCount,
    threadsCreated: act.threadsCreated,
    firstSeen,
    lastSeen,
    revertCount,
    trustScore: computeTrustScore(act.editCount, act.commentCount, revertCount),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a contributor profile for a specific handle.
 *
 * Returns a zeroed-out profile (not an error) when the handle has no activity.
 */
export async function buildContributorProfile(
  handle: string,
): Promise<ContributorProfile> {
  // Scan revisions.
  const revMap = await scanRevisions();
  const act = revMap.get(handle) ?? emptyActivity();

  // Merge talk activity.
  const threads = await loadAllThreads();
  const talkMap = new Map<string, AuthorActivity>();
  talkMap.set(handle, act);
  mergeTalkActivity(talkMap, threads);

  // Detect reverts.
  const revertCounts = await detectReverts();
  const revertCount = revertCounts.get(handle) ?? 0;

  return buildProfileFromActivity(handle, act, revertCount);
}

/**
 * Discover all contributors and build a profile for each.
 *
 * Returns profiles sorted by `editCount` descending.
 */
export async function listContributors(): Promise<ContributorProfile[]> {
  const map = await scanRevisions();
  const threads = await loadAllThreads();
  mergeTalkActivity(map, threads);

  // Detect reverts across all pages.
  const revertCounts = await detectReverts();

  const profiles: ContributorProfile[] = [];
  for (const [handle, act] of map) {
    const revertCount = revertCounts.get(handle) ?? 0;
    profiles.push(buildProfileFromActivity(handle, act, revertCount));
  }

  // Sort by editCount descending, then handle ascending for stability.
  profiles.sort((a, b) => b.editCount - a.editCount || a.handle.localeCompare(b.handle));
  return profiles;
}
