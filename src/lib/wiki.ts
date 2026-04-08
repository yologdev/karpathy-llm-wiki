import fs from "fs/promises";
import path from "path";
import type { WikiPage, IndexEntry } from "./types";
import { callLLM, hasLLMKey } from "./llm";

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

// ---------------------------------------------------------------------------
// Wiki page I/O
// ---------------------------------------------------------------------------

/** Read a wiki page by slug. Returns `null` when the file doesn't exist or the slug is invalid. */
export async function readWikiPage(slug: string): Promise<WikiPage | null> {
  try {
    validateSlug(slug);
  } catch {
    return null;
  }
  const filePath = path.join(getWikiDir(), `${slug}.md`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    // Derive title from the first markdown heading, falling back to the slug.
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    return { slug, title, content, path: filePath };
  } catch {
    return null;
  }
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
  } catch {
    return [];
  }

  const entries: IndexEntry[] = [];
  const lineRe = /^-\s+\[(.+?)]\((.+?)\.md\)\s*—\s*(.+)$/;

  for (const line of raw.split("\n")) {
    const m = line.match(lineRe);
    if (m) {
      entries.push({ title: m[1], slug: m[2], summary: m[3].trim() });
    }
  }
  return entries;
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
  await ensureDirectories();
  const lines = entries.map(
    (e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`,
  );
  const content = `# Wiki Index\n\n${lines.join("\n")}\n`;
  const indexPath = path.join(getWikiDir(), "index.md");
  await fs.writeFile(indexPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Raw source storage
// ---------------------------------------------------------------------------

/** Save a raw source document and return its path. Throws on invalid id. */
export async function saveRawSource(
  id: string,
  content: string,
): Promise<string> {
  validateSlug(id);
  await ensureDirectories();
  const filePath = path.join(getRawDir(), `${id}.md`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

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

  await ensureDirectories();
  const logPath = path.join(getWikiDir(), "log.md");
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const heading = `## [${date}] ${operation} | ${title.trim()}`;

  let block = `${heading}\n\n`;
  if (details && details.trim().length > 0) {
    block += `${details.trim()}\n\n`;
  }
  await fs.appendFile(logPath, block, "utf-8");
}

/** Read the contents of `wiki/log.md`. Returns `null` if the file doesn't exist. */
export async function readLog(): Promise<string | null> {
  const logPath = path.join(getWikiDir(), "log.md");
  try {
    return await fs.readFile(logPath, "utf-8");
  } catch {
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
  } catch {
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
  const updatedSlugs: string[] = [];

  for (const slug of relatedSlugs) {
    const page = await readWikiPage(slug);
    if (!page) continue;

    // Skip if already links to the new page
    if (page.content.includes(`${newSlug}.md`)) continue;

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
}

// ---------------------------------------------------------------------------
// writeWikiPageWithSideEffects — the unified write pipeline
// ---------------------------------------------------------------------------
//
// Both `ingest()` and `saveAnswerToWiki()` need to perform the same 5-step
// sequence when materialising a wiki page: write file → upsert index entry →
// flush index → cross-reference related pages → append log line. Keeping that
// pipeline in one place is the durable fix for the "parallel write-paths
// drift" learning recorded in `.yoyo/learnings.md` — every future write path
// (edit, delete, re-ingest, import) should go through this function.

/** Options accepted by {@link writeWikiPageWithSideEffects}. */
export interface WritePageOptions {
  /** URL-safe slug — validated via {@link validateSlug}. */
  slug: string;
  /** Page title used in the index entry and (optionally) cross-ref links. */
  title: string;
  /** Full markdown to write to `wiki/<slug>.md`. */
  content: string;
  /** Index entry summary line (the bit after the em-dash). */
  summary: string;
  /** Append-only log operation — see {@link LogOperation}. */
  logOp: LogOperation;
  /** Optional callback that produces the log "details" body. */
  logDetails?: (ctx: { updatedSlugs: string[] }) => string;
  /**
   * Source text used for cross-ref discovery.
   *
   * - Defaults to `content` (the page markdown).
   * - `ingest()` passes the raw source text so the LLM sees the full document
   *   rather than the slimmed-down wiki page.
   * - Pass `null` to skip cross-referencing entirely (e.g. for tests or
   *   imports where you want to control linking yourself).
   */
  crossRefSource?: string | null;
}

/** Result of a {@link writeWikiPageWithSideEffects} call. */
export interface WritePageResult {
  /** The slug of the page that was written. */
  slug: string;
  /** Slugs of related pages that received a backlink during cross-ref. */
  updatedSlugs: string[];
}

/** Result of a {@link deleteWikiPage} call. */
export interface DeletePageResult {
  /** The slug of the page that was deleted. */
  slug: string;
  /** Whether an index entry for this slug was actually removed. */
  removedFromIndex: boolean;
  /** Slugs of pages that had a backlink to the deleted page stripped out. */
  strippedBacklinksFrom: string[];
}

/** Escape a string for use inside a regular expression. */
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Delete a wiki page and clean up references to it.
 *
 * Steps:
 * 1. Validate the slug (throws on traversal / invalid).
 * 2. Read the page (throws if it doesn't exist) — captured to get the title
 *    for the log entry.
 * 3. Unlink the `.md` file from the wiki dir.
 * 4. Remove the entry from `index.md`.
 * 5. Strip backlinks from any other wiki page that links to this slug,
 *    cleaning up empty / leading-comma `**See also:**` artefacts.
 * 6. Append a `"delete"` log entry recording the deletion.
 *
 * Hard delete only — no trash, no undo. Raw source files in `raw/` are
 * intentionally NOT touched (the raw layer is immutable per the founding
 * vision).
 */
export async function deleteWikiPage(
  slug: string,
): Promise<DeletePageResult> {
  validateSlug(slug);

  const page = await readWikiPage(slug);
  if (!page) {
    throw new Error(`page not found: ${slug}`);
  }
  const title = page.title;

  // 1. Unlink the page file.
  const filePath = path.join(getWikiDir(), `${slug}.md`);
  await fs.unlink(filePath);

  // 2. Remove the index entry.
  const entries = await listWikiPages();
  const filteredEntries = entries.filter((e) => e.slug !== slug);
  const removedFromIndex = filteredEntries.length !== entries.length;
  await updateIndex(filteredEntries);

  // 3. Strip backlinks from remaining pages.
  const escapedSlug = escapeRegex(slug);
  // Match any markdown link whose target is `${slug}.md`.
  const linkRe = new RegExp(`\\[[^\\]]+\\]\\(${escapedSlug}\\.md\\)`, "g");

  const strippedBacklinksFrom: string[] = [];
  for (const entry of filteredEntries) {
    const otherPage = await readWikiPage(entry.slug);
    if (!otherPage) continue;
    if (!otherPage.content.includes(`${slug}.md`)) continue;

    // 1. Strip the actual link occurrences.
    let updated = otherPage.content.replace(linkRe, "");

    // 2. Clean up See also artefacts left behind.
    //
    //    a) Drop empty See-also lines: `**See also:** ` (optionally with
    //       trailing whitespace) on its own line.
    updated = updated.replace(/^\*\*See also:\*\*\s*$/gm, "");
    //    b) Fix leading comma: `**See also:** , X` → `**See also:** X`
    updated = updated.replace(
      /(\*\*See also:\*\*)\s*,\s*/g,
      "$1 ",
    );
    //    c) Fix trailing comma at end-of-line: `..., \n` → `\n`
    updated = updated.replace(/,\s*$/gm, "");
    //    d) Collapse runs of 3+ blank lines that the empty-line removal may
    //       have produced into a single blank line, so we don't leave a hole.
    updated = updated.replace(/\n{3,}/g, "\n\n");

    if (updated !== otherPage.content) {
      await writeWikiPage(entry.slug, updated);
      strippedBacklinksFrom.push(entry.slug);
    }
  }

  // 4. Log the deletion.
  await appendToLog(
    "delete",
    title ?? slug,
    `deleted · stripped backlinks from ${strippedBacklinksFrom.length} page(s)`,
  );

  return { slug, removedFromIndex, strippedBacklinksFrom };
}

/**
 * Write a wiki page and run the full set of side effects every write-path
 * in this codebase needs:
 *
 * 1. Validate the slug.
 * 2. Write `wiki/<slug>.md`.
 * 3. Upsert an `{ title, slug, summary }` entry into `wiki/index.md`
 *    (re-uses an existing entry's row if the slug already exists, so
 *    re-writes don't produce duplicates).
 * 4. Cross-reference related pages via {@link findRelatedPages} +
 *    {@link updateRelatedPages}, unless `crossRefSource` is `null`.
 * 5. Append a structured entry to `wiki/log.md`.
 */
export async function writeWikiPageWithSideEffects(
  opts: WritePageOptions,
): Promise<WritePageResult> {
  const { slug, title, content, summary, logOp, logDetails } = opts;

  // 1. Validate — writeWikiPage also validates, but we want to fail fast
  // before any filesystem mutation happens.
  validateSlug(slug);

  // 2. Write the page file itself.
  await writeWikiPage(slug, content);

  // 3. Upsert the index entry. Re-read so we never clobber concurrent
  // updates that landed between caller-read and now.
  const entries = await listWikiPages();
  const existingIdx = entries.findIndex((e) => e.slug === slug);
  if (existingIdx !== -1) {
    entries[existingIdx].title = title;
    entries[existingIdx].summary = summary;
  } else {
    entries.push({ title, slug, summary });
  }
  await updateIndex(entries);

  // 4. Cross-reference. `crossRefSource === null` means "explicit skip".
  // `undefined` falls back to the page content itself.
  let updatedSlugs: string[] = [];
  if (opts.crossRefSource !== null) {
    const sourceForCrossRef = opts.crossRefSource ?? content;
    const refreshedEntries = await listWikiPages();
    const relatedSlugs = await findRelatedPages(
      slug,
      sourceForCrossRef,
      refreshedEntries,
    );
    updatedSlugs = await updateRelatedPages(slug, title, relatedSlugs);
  }

  // 5. Log.
  const details = logDetails?.({ updatedSlugs });
  await appendToLog(logOp, title, details);

  return { slug, updatedSlugs };
}
