import fs from "fs/promises";
import path from "path";
import type { WikiPage, IndexEntry } from "./types";
import { withFileLock } from "./lock";
import { saveRevision } from "./revisions";
import { isEnoent } from "./errors";
import {
  getWikiDir as _getWikiDir,
  getRawDir as _getRawDir,
} from "./config";

// ---------------------------------------------------------------------------
// Configurable base directories — delegated to the config layer
// ---------------------------------------------------------------------------

export function getWikiDir(): string {
  return _getWikiDir();
}

export function getRawDir(): string {
  return _getRawDir();
}

// ---------------------------------------------------------------------------
// Slug validation — path traversal protection
// ---------------------------------------------------------------------------

/** Safe slug pattern: lowercase alphanumeric, may contain hyphens, cannot start/end with hyphen. */
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Validate that a slug is safe to use as a filename inside the wiki/raw dirs.
 *
 * Rejects empty strings, path traversal attempts (`..`, `/`, `\`), null bytes,
 * and anything that doesn't match the safe pattern.
 *
 * @throws {Error} with a descriptive message when the slug is invalid.
 */
export function validateSlug(slug: string): void {
  if (typeof slug !== "string" || slug.trim().length === 0) {
    throw new Error("Invalid slug: must be a non-empty string");
  }
  if (slug.includes("\0")) {
    throw new Error("Invalid slug: must not contain null bytes");
  }
  if (slug.includes("/") || slug.includes("\\")) {
    throw new Error("Invalid slug: must not contain path separators");
  }
  if (slug.includes("..")) {
    throw new Error("Invalid slug: must not contain path traversal (..)")
  }
  if (!SAFE_SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid slug: "${slug}" does not match the safe pattern (lowercase alphanumeric and hyphens, cannot start or end with hyphen)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/** Create the `raw/` and `wiki/` directories if they don't already exist. */
export async function ensureDirectories(): Promise<void> {
  await fs.mkdir(getWikiDir(), { recursive: true });
  await fs.mkdir(getRawDir(), { recursive: true });
}

// Re-export frontmatter utilities for backward compatibility
export { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
export type { Frontmatter, ParsedPage } from "./frontmatter";

// Import frontmatter utilities for local use within this module
import { parseFrontmatter } from "./frontmatter";
import type { Frontmatter } from "./frontmatter";

// ---------------------------------------------------------------------------
// Per-operation page cache — opt-in to avoid redundant filesystem reads
// ---------------------------------------------------------------------------

/** Module-level cache state. `null` means caching is inactive. */
let pageCache: Map<string, WikiPage | null> | null = null;
let pageCacheRefCount = 0;

/**
 * Enable per-operation page caching. Returns a cleanup function that
 * deactivates the cache and discards all entries.
 *
 * While active, `readWikiPage()` checks the cache before reading disk and
 * stores its result. `writeWikiPage()` invalidates the cache entry so the
 * next read fetches fresh data.
 *
 * Uses reference counting so multiple concurrent operations can share the
 * same cache — it is only cleaned up when the last user releases it.
 */
export function beginPageCache(): () => void {
  if (pageCacheRefCount === 0) {
    pageCache = new Map();
  }
  pageCacheRefCount++;
  return () => {
    pageCacheRefCount--;
    if (pageCacheRefCount <= 0) {
      pageCache = null;
      pageCacheRefCount = 0;
    }
  };
}

/**
 * Convenience wrapper: run `fn` with page caching enabled, then clean up —
 * even if `fn` throws.
 */
export async function withPageCache<T>(fn: () => Promise<T>): Promise<T> {
  const cleanup = beginPageCache();
  try {
    return await fn();
  } finally {
    cleanup();
  }
}

/** For testing: return the number of entries in the active cache, or 0 if inactive. */
export function _getPageCacheSize(): number {
  return pageCache?.size ?? 0;
}

// ---------------------------------------------------------------------------
// Wiki page I/O
// ---------------------------------------------------------------------------

/** Read a wiki page by slug. Returns `null` when the file doesn't exist or the slug is invalid. */
export async function readWikiPage(slug: string): Promise<WikiPage | null> {
  try {
    validateSlug(slug);
  } catch (err) {
    console.warn(`[wiki] readWikiPage slug validation failed for "${slug}":`, err);
    return null;
  }

  // Check cache first (when active)
  if (pageCache !== null && pageCache.has(slug)) {
    return pageCache.get(slug) ?? null;
  }

  const filePath = path.join(getWikiDir(), `${slug}.md`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    // Derive title from the first markdown heading, falling back to the slug.
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    const result: WikiPage = { slug, title, content, path: filePath };

    // Store in cache (when active)
    if (pageCache !== null) {
      pageCache.set(slug, result);
    }

    return result;
  } catch (err) {
    if (!isEnoent(err)) {
      console.warn(`[wiki] readWikiPage failed for "${slug}":`, err);
    }
    // Store negative result in cache too (when active)
    if (pageCache !== null) {
      pageCache.set(slug, null);
    }
    return null;
  }
}

/**
 * Extended read that additionally exposes parsed frontmatter and the
 * body (markdown with the YAML block stripped).
 *
 * This is a separate export so that {@link WikiPage} in `types.ts` stays
 * unchanged and existing call sites continue to work without modification.
 * Callers that specifically need the frontmatter — currently only
 * `ingest()`'s re-ingest path — use this helper.
 *
 * Returns `null` when the page doesn't exist or the slug is invalid.
 * Throws when the file exists but its frontmatter block is malformed.
 */
export async function readWikiPageWithFrontmatter(
  slug: string,
): Promise<(WikiPage & { frontmatter: Frontmatter; body: string }) | null> {
  const page = await readWikiPage(slug);
  if (!page) return null;
  const { data, body } = parseFrontmatter(page.content);
  // Prefer the H1 inside the body so frontmatter lines can never contribute
  // to the derived title.
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : page.title;
  return { ...page, title, frontmatter: data, body };
}

/** Write (or overwrite) a wiki page. Ensures the wiki directory exists first. Throws on invalid slug. */
export async function writeWikiPage(
  slug: string,
  content: string,
): Promise<void> {
  validateSlug(slug);
  await ensureDirectories();
  const filePath = path.join(getWikiDir(), `${slug}.md`);

  // Snapshot the current content as a revision before overwriting.
  // Only save a revision if the file already exists (new pages don't have
  // a previous version to save).
  try {
    const existing = await fs.readFile(filePath, "utf-8");
    await saveRevision(slug, existing);
  } catch (err) {
    // File doesn't exist yet — first write, no revision needed.
    if (!isEnoent(err)) {
      console.warn(`[wiki] unexpected error reading existing page "${slug}" before revision:`, err);
    }
  }

  await fs.writeFile(filePath, content, "utf-8");

  // Invalidate cache entry so next read fetches fresh data
  if (pageCache !== null) {
    pageCache.delete(slug);
  }
}

// ---------------------------------------------------------------------------
// Index management
// ---------------------------------------------------------------------------

/**
 * Parse `wiki/index.md` and return its entries.
 * Returns an empty array when the file doesn't exist.
 *
 * Expected format per line:
 *   - [Title](slug.md) — summary
 */
export async function listWikiPages(): Promise<IndexEntry[]> {
  const indexPath = path.join(getWikiDir(), "index.md");
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, "utf-8");
  } catch (err: unknown) {
    if (!isEnoent(err)) {
      console.warn("[wiki] listWikiPages failed to read index.md:", err);
    }
    return [];
  }

  const baseEntries: IndexEntry[] = [];
  const lineRe = /^-\s+\[(.+?)]\((.+?)\.md\)\s*—\s*(.+)$/;

  for (const line of raw.split("\n")) {
    const m = line.match(lineRe);
    if (m) {
      baseEntries.push({ title: m[1], slug: m[2], summary: m[3].trim() });
    }
  }

  // Enrich every entry in parallel with frontmatter-derived metadata
  // (tags / updated / source_count). If any individual page fails to
  // parse, we log a warning and fall back to the plain entry so that
  // one malformed page never breaks the whole index.
  const enriched = await Promise.all(
    baseEntries.map(async (entry): Promise<IndexEntry> => {
      try {
        const page = await readWikiPageWithFrontmatter(entry.slug);
        if (!page) return entry;
        const fm = page.frontmatter;

        const tags =
          Array.isArray(fm.tags)
            ? fm.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
            : undefined;

        const updated =
          typeof fm.updated === "string" && fm.updated.length > 0
            ? fm.updated
            : undefined;

        // source_count is persisted as a string (see ingest.ts); parse defensively.
        const sourceCountRaw = fm.source_count;
        const sourceCountNum =
          typeof sourceCountRaw === "string" && sourceCountRaw.length > 0
            ? Number.parseInt(sourceCountRaw, 10)
            : NaN;
        const sourceCount = Number.isFinite(sourceCountNum) && sourceCountNum >= 0
          ? sourceCountNum
          : undefined;

        const sourceUrl =
          typeof fm.source_url === "string" && fm.source_url.length > 0
            ? fm.source_url
            : undefined;

        return {
          ...entry,
          ...(tags && tags.length > 0 ? { tags } : {}),
          ...(updated ? { updated } : {}),
          ...(sourceCount !== undefined ? { sourceCount } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
        };
      } catch (err) {
        console.warn(
          `listWikiPages: failed to read frontmatter for "${entry.slug}" — falling back to plain entry`,
          err,
        );
        return entry;
      }
    }),
  );

  return enriched;
}

/**
 * Write `wiki/index.md` from an array of entries.
 *
 * Format:
 * ```
 * # Wiki Index
 *
 * - [Title](slug.md) — summary
 * ```
 */
export async function updateIndex(entries: IndexEntry[]): Promise<void> {
  await withFileLock("index.md", async () => {
    await updateIndexUnsafe(entries);
  });
}

/**
 * Write `wiki/index.md` from an array of entries **without** acquiring the
 * `index.md` file lock.
 *
 * This exists so that callers who already hold the lock (e.g.
 * `runPageLifecycleOp` in `lifecycle.ts`) can perform a read → mutate → write
 * cycle atomically without double-locking.
 *
 * **Do not call from outside a `withFileLock("index.md", …)` block** — use
 * {@link updateIndex} instead.
 */
export async function updateIndexUnsafe(entries: IndexEntry[]): Promise<void> {
  await ensureDirectories();
  const lines = entries.map(
    (e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`,
  );
  const content = `# Wiki Index\n\n${lines.join("\n")}\n`;
  const indexPath = path.join(getWikiDir(), "index.md");
  await fs.writeFile(indexPath, content, "utf-8");
}

// Re-export raw source utilities for backward compatibility
export { saveRawSource, listRawSources, readRawSource } from "./raw";
export type { RawSource, RawSourceWithContent } from "./raw";

// ---------------------------------------------------------------------------
// Append-only log — re-exported from wiki-log.ts for backward compat
// ---------------------------------------------------------------------------

export { appendToLog, readLog } from "./wiki-log";
export type { LogOperation } from "./wiki-log";

// ---------------------------------------------------------------------------
// Search & cross-referencing — re-exported from search.ts for backward compat
// ---------------------------------------------------------------------------

export {
  findRelatedPages,
  updateRelatedPages,
  findBacklinks,
  searchWikiContent,
  fuzzySearchWikiContent,
  fuzzyMatch,
  levenshteinDistance,
} from "./search";
export type { ContentSearchResult } from "./search";

// ---------------------------------------------------------------------------
// Lifecycle pipeline — re-exported from lifecycle.ts for backward compatibility
// ---------------------------------------------------------------------------

export { writeWikiPageWithSideEffects, deleteWikiPage } from "./lifecycle";
export type {
  WritePageOptions,
  WritePageResult,
  DeletePageResult,
} from "./lifecycle";
