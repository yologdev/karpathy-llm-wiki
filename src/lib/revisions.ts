import { getWikiDir, wikiRelPath, validateSlug } from "./wiki";
import { getStorage } from "./storage";
import { isEnoent } from "./errors";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Revision history — store full-page snapshots before every overwrite
// ---------------------------------------------------------------------------
//
// Revisions live in `wiki/.revisions/<slug>/` as timestamped markdown files.
// Each file is the complete page content (including frontmatter) at that
// point in time — simple, no diffs, easy to reason about.
//
// The founding vision says "the wiki is just a git repo… you get version
// history for free." This module provides that version history without
// requiring git on the server.

/** Metadata about a single page revision (the content itself is on disk). */
export interface Revision {
  /** Unix timestamp in milliseconds — also the filename stem. */
  timestamp: number;
  /** ISO 8601 date string for display. */
  date: string;
  /** Page slug this revision belongs to. */
  slug: string;
  /** Byte length of the revision content. */
  sizeBytes: number;
  /** Who made this change — undefined for legacy revisions without attribution. */
  author?: string;
  /** Edit summary — why this change was made. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

const REVISIONS_DIR_NAME = ".revisions";

/** Return the revisions directory for a given slug. */
export function getRevisionsDir(slug: string): string {
  return `${getWikiDir()}/${REVISIONS_DIR_NAME}/${slug}`;
}

/**
 * Compute a storage-relative path for a revision file.
 *
 * All revision files live under `wiki/.revisions/<slug>/`. This helper
 * builds the relative path that the StorageProvider expects.
 */
function revisionsRelPath(...segments: string[]): string {
  return wikiRelPath([REVISIONS_DIR_NAME, ...segments].join("/"));
}

// ---------------------------------------------------------------------------
// Monotonic timestamp — ensures unique filenames even when multiple
// revisions are saved within the same millisecond.
// ---------------------------------------------------------------------------

let lastTimestamp = 0;

function uniqueTimestamp(): number {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Save a snapshot of `content` as a revision for `slug`.
 *
 * Called by `writeWikiPage()` **before** the file is overwritten, so the
 * previous version is preserved. New pages (first write) skip this step
 * because there is no previous content to snapshot.
 *
 * When `author` or `reason` is provided, a JSON sidecar (`<timestamp>.meta.json`)
 * is written alongside the `.md` file to record attribution and edit summary
 * without changing the markdown file format.
 */
export async function saveRevision(
  slug: string,
  content: string,
  author?: string,
  reason?: string,
): Promise<void> {
  validateSlug(slug);
  const storage = getStorage();
  const timestamp = uniqueTimestamp();
  await storage.writeFile(revisionsRelPath(slug, `${timestamp}.md`), content);

  // Write attribution/reason as a JSON sidecar when provided.
  if (author !== undefined || reason !== undefined) {
    const meta: Record<string, string> = {};
    if (author !== undefined) meta.author = author;
    if (reason !== undefined) meta.reason = reason;
    await storage.writeFile(
      revisionsRelPath(slug, `${timestamp}.meta.json`),
      JSON.stringify(meta),
    );
  }
}

/**
 * List all revisions for a page, newest first.
 *
 * Returns an empty array when no revisions exist (new page or never edited).
 */
export async function listRevisions(slug: string): Promise<Revision[]> {
  validateSlug(slug);
  const storage = getStorage();
  const dirPath = revisionsRelPath(slug);

  let entries: { name: string; isDirectory: boolean }[];
  try {
    entries = await storage.listFiles(dirPath);
  } catch (err) {
    // Directory doesn't exist → no revisions.
    if (!isEnoent(err)) {
      logger.warn("revisions", `unexpected error reading revision dir for "${slug}":`, err);
    }
    return [];
  }

  const revisions: Revision[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.endsWith(".md")) continue;
    const stem = entry.name.slice(0, -3); // strip ".md"
    const timestamp = Number(stem);
    if (Number.isNaN(timestamp) || timestamp <= 0) continue;

    try {
      const stat = await storage.stat(revisionsRelPath(slug, entry.name));

      // Read the optional author/reason sidecar.
      let author: string | undefined;
      let reason: string | undefined;
      try {
        const metaRaw = await storage.readFile(revisionsRelPath(slug, `${stem}.meta.json`));
        const meta = JSON.parse(metaRaw) as { author?: string; reason?: string };
        if (typeof meta.author === "string") {
          author = meta.author;
        }
        if (typeof meta.reason === "string") {
          reason = meta.reason;
        }
      } catch {
        // No sidecar → no author/reason attribution (backward compat).
      }

      revisions.push({
        timestamp,
        date: new Date(timestamp).toISOString(),
        slug,
        sizeBytes: stat.size,
        ...(author !== undefined && { author }),
        ...(reason !== undefined && { reason }),
      });
    } catch (err) {
      // File disappeared between listFiles and stat — skip.
      if (!isEnoent(err)) {
        logger.warn("revisions", `unexpected error stating revision file "${entry.name}":`, err);
      }
    }
  }

  // Sort newest first.
  revisions.sort((a, b) => b.timestamp - a.timestamp);
  return revisions;
}

/**
 * Read a specific revision's content.
 *
 * Returns `null` when the revision does not exist.
 */
export async function readRevision(
  slug: string,
  timestamp: number,
): Promise<string | null> {
  validateSlug(slug);
  try {
    return await getStorage().readFile(revisionsRelPath(slug, `${timestamp}.md`));
  } catch (err) {
    if (!isEnoent(err)) {
      logger.warn("revisions", `unexpected error reading revision "${slug}@${timestamp}":`, err);
    }
    return null;
  }
}

/**
 * Delete all revisions for a page.
 *
 * Called when a page is permanently deleted so we don't leave orphaned
 * revision data on disk.
 */
export async function deleteRevisions(slug: string): Promise<void> {
  validateSlug(slug);
  try {
    await getStorage().deleteDirectory(revisionsRelPath(slug));
  } catch (err) {
    // Already gone — nothing to do.
    if (!isEnoent(err)) {
      logger.warn("revisions", `unexpected error deleting revisions for "${slug}":`, err);
    }
  }
}
