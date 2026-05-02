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
// Trust score
// ---------------------------------------------------------------------------

/** Compute trust score from activity counts.
 *  Placeholder heuristic: min(1, (editCount + commentCount) / 50). */
function computeTrustScore(editCount: number, commentCount: number): number {
  return Math.min(1, (editCount + commentCount) / 50);
}

// ---------------------------------------------------------------------------
// Profile builder
// ---------------------------------------------------------------------------

function buildProfileFromActivity(
  handle: string,
  act: AuthorActivity,
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
    trustScore: computeTrustScore(act.editCount, act.commentCount),
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

  return buildProfileFromActivity(handle, act);
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

  const profiles: ContributorProfile[] = [];
  for (const [handle, act] of map) {
    profiles.push(buildProfileFromActivity(handle, act));
  }

  // Sort by editCount descending, then handle ascending for stability.
  profiles.sort((a, b) => b.editCount - a.editCount || a.handle.localeCompare(b.handle));
  return profiles;
}
