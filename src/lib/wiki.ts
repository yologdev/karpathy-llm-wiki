import fs from "fs/promises";
import path from "path";
import type { WikiPage, IndexEntry } from "./types";
import { callLLM, hasLLMKey } from "./llm";
import { withFileLock } from "./lock";
import { hasLinkTo } from "./links";

// ---------------------------------------------------------------------------
// Configurable base directories — override via env vars for testing
// ---------------------------------------------------------------------------

export function getWikiDir(): string {
  return process.env.WIKI_DIR ?? path.join(process.cwd(), "wiki");
}

export function getRawDir(): string {
  return process.env.RAW_DIR ?? path.join(process.cwd(), "raw");
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

/**
 * Enable per-operation page caching. Returns a cleanup function that
 * deactivates the cache and discards all entries.
 *
 * While active, `readWikiPage()` checks the cache before reading disk and
 * stores its result. `writeWikiPage()` invalidates the cache entry so the
 * next read fetches fresh data.
 */
export function beginPageCache(): () => void {
  pageCache = new Map();
  return () => {
    pageCache = null;
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
    console.warn(`[wiki] readWikiPage failed for "${slug}":`, err);
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
  } catch (err) {
    console.warn("[wiki] listWikiPages failed to read index.md:", err);
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

        return {
          ...entry,
          ...(tags && tags.length > 0 ? { tags } : {}),
          ...(updated ? { updated } : {}),
          ...(sourceCount !== undefined ? { sourceCount } : {}),
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
// Append-only log
// ---------------------------------------------------------------------------

/** Allowed operation kinds for log entries. */
export type LogOperation =
  | "ingest"
  | "query"
  | "lint"
  | "save"
  | "edit"
  | "delete"
  | "other";

const ALLOWED_LOG_OPERATIONS: readonly LogOperation[] = [
  "ingest",
  "query",
  "lint",
  "save",
  "edit",
  "delete",
  "other",
];

/**
 * Append a structured entry to `wiki/log.md`, following the founding-spec format:
 *
 * ```
 * ## [2026-04-07] ingest | Article Title
 *
 * <optional details line>
 *
 * ```
 *
 * Each entry is a markdown H2 heading, making the log both human-readable
 * (renders as a list of section headings) and grep-friendly:
 * `grep "^## \[" wiki/log.md | tail -5` returns the last 5 entries.
 *
 * @throws {Error} when `operation` is not one of the allowed values.
 * @throws {Error} when `title` is empty (after trimming).
 */
export async function appendToLog(
  operation: LogOperation,
  title: string,
  details?: string,
): Promise<void> {
  if (!ALLOWED_LOG_OPERATIONS.includes(operation)) {
    throw new Error(
      `Invalid log operation: "${operation}" (must be one of ${ALLOWED_LOG_OPERATIONS.join(", ")})`,
    );
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Invalid log title: must be a non-empty string");
  }

  await withFileLock("log.md", async () => {
    await ensureDirectories();
    const logPath = path.join(getWikiDir(), "log.md");
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const heading = `## [${date}] ${operation} | ${title.trim()}`;

    let block = `${heading}\n\n`;
    if (details && details.trim().length > 0) {
      block += `${details.trim()}\n\n`;
    }
    await fs.appendFile(logPath, block, "utf-8");
  });
}

/** Read the contents of `wiki/log.md`. Returns `null` if the file doesn't exist. */
export async function readLog(): Promise<string | null> {
  const logPath = path.join(getWikiDir(), "log.md");
  try {
    return await fs.readFile(logPath, "utf-8");
  } catch (err) {
    console.warn("[wiki] readLog failed to read log.md:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cross-referencing helpers
// ---------------------------------------------------------------------------

const RELATED_PAGES_PROMPT = `Given this new wiki page and the existing wiki index, return a JSON array of slugs for pages that are related and should cross-reference this new page. Return at most 5 slugs. Return only the JSON array, nothing else.`;

/**
 * Identify existing wiki pages that are related to a newly written page.
 *
 * Sends the index entries + a summary of the new content to the LLM and asks
 * it to return a JSON array of related slugs. Falls back to an empty array
 * when there is no LLM key, no existing pages, or any error occurs.
 */
export async function findRelatedPages(
  newSlug: string,
  newContent: string,
  existingEntries: IndexEntry[],
): Promise<string[]> {
  // Nothing to cross-reference when there's no LLM or no existing pages
  if (!hasLLMKey() || existingEntries.length === 0) {
    return [];
  }

  // Build a user message with the index and the new page's content
  const indexList = existingEntries
    .filter((e) => e.slug !== newSlug)
    .map((e) => `- ${e.slug}: ${e.title} — ${e.summary}`)
    .join("\n");

  if (!indexList) {
    return [];
  }

  const userMessage = `## New page (slug: ${newSlug})\n\n${newContent.slice(0, 2000)}\n\n## Existing wiki index\n\n${indexList}`;

  try {
    const response = await callLLM(RELATED_PAGES_PROMPT, userMessage);

    // Extract JSON array from response — allow surrounding whitespace/text
    const match = response.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    // Validate: only keep slugs that actually exist in the index (and aren't the new page)
    const validSlugs = new Set(
      existingEntries.filter((e) => e.slug !== newSlug).map((e) => e.slug),
    );
    return parsed
      .filter((s): s is string => typeof s === "string" && validSlugs.has(s))
      .slice(0, 5);
  } catch (err) {
    console.warn("[wiki] findRelatedPages LLM call failed:", err);
    return [];
  }
}

/**
 * Append cross-reference links to related wiki pages.
 *
 * For each related slug:
 * - Reads the existing wiki page
 * - Skips if it already contains a link to the new slug
 * - Appends a "See also" link (or extends an existing "See also" section)
 *
 * Returns the slugs that were actually modified.
 */
export async function updateRelatedPages(
  newSlug: string,
  newTitle: string,
  relatedSlugs: string[],
): Promise<string[]> {
  return withFileLock("cross-ref", async () => {
    const updatedSlugs: string[] = [];

    for (const slug of relatedSlugs) {
      const page = await readWikiPage(slug);
      if (!page) continue;

      // Skip if already links to the new page (use proper link detection
      // rather than substring matching to avoid false positives when the slug
      // appears in prose without being a wiki link).
      if (hasLinkTo(page.content, newSlug)) continue;

      const link = `[${newTitle}](${newSlug}.md)`;
      let updatedContent: string;

      // Check if there's already a "See also" section
      const seeAlsoPattern = /^(\*\*See also:\*\*.*)$/m;
      const seeAlsoMatch = page.content.match(seeAlsoPattern);

      if (seeAlsoMatch) {
        // Append to existing "See also" line
        updatedContent = page.content.replace(
          seeAlsoPattern,
          `${seeAlsoMatch[1]}, ${link}`,
        );
      } else {
        // Add a new "See also" section at the end
        updatedContent = `${page.content.trimEnd()}\n\n**See also:** ${link}\n`;
      }

      await writeWikiPage(slug, updatedContent);
      updatedSlugs.push(slug);
    }

    return updatedSlugs;
  });
}

// ---------------------------------------------------------------------------
// Backlinks — "What links here"
// ---------------------------------------------------------------------------

/**
 * Find all wiki pages that link to the given slug.
 * Returns an array of { slug, title } for pages containing a markdown link
 * to `targetSlug.md`.
 */
export async function findBacklinks(
  targetSlug: string,
): Promise<Array<{ slug: string; title: string }>> {
  return withPageCache(async () => {
    const pages = await listWikiPages();
    const backlinks: Array<{ slug: string; title: string }> = [];

    for (const page of pages) {
      if (page.slug === targetSlug || page.slug === "index" || page.slug === "log")
        continue;
      const wikiPage = await readWikiPage(page.slug);
      if (wikiPage && hasLinkTo(wikiPage.content, targetSlug)) {
        backlinks.push({ slug: page.slug, title: page.title });
      }
    }

    return backlinks;
  });
}

// ---------------------------------------------------------------------------
// Full-text content search
// ---------------------------------------------------------------------------

/** A search result with snippet context. */
export interface ContentSearchResult {
  slug: string;
  title: string;
  summary: string;
  /** Short snippet showing the match context */
  snippet: string;
}

/**
 * Search wiki page content for a query string.
 *
 * Simple case-insensitive term matching across all wiki pages.
 * Designed for the real-time search bar — uses OR semantics (any term matches)
 * and scores by number of matching terms.
 */
export async function searchWikiContent(
  query: string,
  maxResults = 10,
): Promise<ContentSearchResult[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [];

  const wikiDir = getWikiDir();
  let files: string[];
  try {
    files = await fs.readdir(wikiDir);
  } catch (err) {
    console.warn("[wiki] searchWikiContent failed to read wiki directory:", err);
    return [];
  }

  const SKIP = new Set(["index.md", "log.md"]);

  const scored: Array<{
    slug: string;
    title: string;
    summary: string;
    snippet: string;
    score: number;
  }> = [];

  for (const file of files) {
    if (!file.endsWith(".md") || SKIP.has(file)) continue;
    const slug = file.replace(/\.md$/, "");

    let content: string;
    try {
      content = await fs.readFile(path.join(wikiDir, file), "utf-8");
    } catch (err) {
      console.warn(`[wiki] searchWikiContent failed to read "${file}":`, err);
      continue;
    }

    const lower = content.toLowerCase();

    // Count how many query terms appear
    let score = 0;
    let firstMatchIndex = -1;
    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx !== -1) {
        score++;
        if (firstMatchIndex === -1 || idx < firstMatchIndex) {
          firstMatchIndex = idx;
        }
      }
    }

    if (score === 0) continue;

    // Extract title from first heading or slug
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    // Extract summary from index-style content (first paragraph after heading)
    const parsed = parseFrontmatter(content);
    const body = parsed.body;
    const summaryLine = body
      .replace(/^#\s+.+$/m, "")
      .trim()
      .split("\n")
      .find((l) => l.trim().length > 0);
    const summary = summaryLine
      ? summaryLine.trim().slice(0, 120) + (summaryLine.length > 120 ? "…" : "")
      : "";

    // Build a snippet around the first match
    const snippetRadius = 60;
    const start = Math.max(0, firstMatchIndex - snippetRadius);
    const end = Math.min(content.length, firstMatchIndex + snippetRadius);
    let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < content.length) snippet = snippet + "…";

    scored.push({ slug, title, summary, snippet, score });
  }

  // Sort by score descending, then alphabetically by title
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return scored.slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// Lifecycle pipeline — re-exported from lifecycle.ts for backward compatibility
// ---------------------------------------------------------------------------

export { writeWikiPageWithSideEffects, deleteWikiPage } from "./lifecycle";
export type {
  WritePageOptions,
  WritePageResult,
  DeletePageResult,
} from "./lifecycle";
