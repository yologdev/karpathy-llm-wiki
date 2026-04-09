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

// Re-export frontmatter utilities for backward compatibility
export { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
export type { Frontmatter, ParsedPage } from "./frontmatter";

// Import frontmatter utilities for local use within this module
import { parseFrontmatter } from "./frontmatter";
import type { Frontmatter } from "./frontmatter";

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

// ---------------------------------------------------------------------------
// runPageLifecycleOp — the shared lifecycle-op pipeline
// ---------------------------------------------------------------------------
//
// Anything that touches `wiki/<slug>.md` + `index.md` + other pages + `log.md`
// is the same shape of operation regardless of whether it creates, updates, or
// deletes a page. Per the "Delete is a write-path too — lifecycle ops, not
// just writes" learning in `.yoyo/learnings.md`, every such op flows through
// this one function, which owns the 5-step side-effect orchestration:
//
//   1. Validate the slug.
//   2. Mutate the page file on disk (write / unlink).
//   3. Mutate `index.md` (upsert / remove).
//   4. Cross-reference other pages (add "See also" links / strip backlinks).
//   5. Append a structured entry to `log.md`.
//
// Per-op differences live on the `op` strategy object. `writeWikiPageWithSideEffects`
// and `deleteWikiPage` are thin wrappers that construct the appropriate op
// and pass it through.

type PageLifecycleOp =
  | {
      kind: "write";
      title: string;
      content: string;
      summary: string;
      /**
       * Source text used for cross-ref discovery.
       * - `undefined` → use the page content itself.
       * - `null` → explicit skip (no cross-ref pass at all).
       * - string → use that text (e.g. raw source in ingest).
       */
      crossRefSource?: string | null;
    }
  | {
      kind: "delete";
      /** Title used in the log entry (captured before unlink). */
      title: string;
    };

/** Internal result of a lifecycle op — a superset of Write/Delete result shapes. */
interface LifecycleOpResult {
  slug: string;
  /** Pages that gained a backlink (write) — empty for delete. */
  crossRefedSlugs: string[];
  /** Pages that had a backlink stripped (delete) — empty for write. */
  strippedBacklinksFrom: string[];
  /** Whether the index actually had a row removed (delete) — false for write. */
  removedFromIndex: boolean;
}

/**
 * Strip every markdown link to `${slug}.md` from `content` and tidy up any
 * `**See also:**` artefacts the removal leaves behind. Returns the rewritten
 * content (or the input unchanged if no links were present).
 */
function stripBacklinksTo(slug: string, content: string): string {
  const escapedSlug = escapeRegex(slug);
  // `g` flag: declared at narrowest scope to avoid cross-call `lastIndex` leaks.
  const linkRe = new RegExp(`\\[[^\\]]+\\]\\(${escapedSlug}\\.md\\)`, "g");

  // 1. Strip the actual link occurrences.
  let updated = content.replace(linkRe, "");

  // 2. Clean up See also artefacts left behind.
  //
  //    a) Drop empty See-also lines: `**See also:** ` (optionally with
  //       trailing whitespace) on its own line.
  updated = updated.replace(/^\*\*See also:\*\*\s*$/gm, "");
  //    b) Fix leading comma: `**See also:** , X` → `**See also:** X`
  updated = updated.replace(/(\*\*See also:\*\*)\s*,\s*/g, "$1 ");
  //    c) Fix trailing comma at end-of-line: `..., \n` → `\n`
  updated = updated.replace(/,\s*$/gm, "");
  //    d) Collapse runs of 3+ blank lines that the empty-line removal may
  //       have produced into a single blank line, so we don't leave a hole.
  updated = updated.replace(/\n{3,}/g, "\n\n");

  return updated;
}

/**
 * Shared lifecycle-op pipeline for write and delete. See the block comment
 * above for the full 5-step shape.
 */
async function runPageLifecycleOp(
  slug: string,
  op: PageLifecycleOp,
  logOp: LogOperation,
  logDetails?: (ctx: {
    crossRefedSlugs: string[];
    strippedBacklinksFrom: string[];
  }) => string | undefined,
): Promise<LifecycleOpResult> {
  // 1. Validate — the per-step helpers also validate, but we want to fail
  //    fast before any filesystem mutation happens.
  validateSlug(slug);

  // 2. Mutate the page file.
  if (op.kind === "write") {
    await writeWikiPage(slug, op.content);
  } else {
    const filePath = path.join(getWikiDir(), `${slug}.md`);
    await fs.unlink(filePath);
  }

  // 3. Mutate the index. Re-read so we never clobber concurrent updates
  //    that landed between caller-read and now.
  const entries = await listWikiPages();
  let removedFromIndex = false;
  let postIndexEntries: IndexEntry[];
  if (op.kind === "write") {
    const existingIdx = entries.findIndex((e) => e.slug === slug);
    if (existingIdx !== -1) {
      entries[existingIdx].title = op.title;
      entries[existingIdx].summary = op.summary;
    } else {
      entries.push({ title: op.title, slug, summary: op.summary });
    }
    postIndexEntries = entries;
  } else {
    postIndexEntries = entries.filter((e) => e.slug !== slug);
    removedFromIndex = postIndexEntries.length !== entries.length;
  }
  await updateIndex(postIndexEntries);

  // 4. Cross-reference other pages.
  //    - write: discover related pages and add backlinks TO this slug.
  //    - delete: rewrite every remaining page to strip links to this slug.
  let crossRefedSlugs: string[] = [];
  const strippedBacklinksFrom: string[] = [];
  if (op.kind === "write") {
    if (op.crossRefSource !== null) {
      const sourceForCrossRef = op.crossRefSource ?? op.content;
      const refreshedEntries = await listWikiPages();
      const relatedSlugs = await findRelatedPages(
        slug,
        sourceForCrossRef,
        refreshedEntries,
      );
      crossRefedSlugs = await updateRelatedPages(slug, op.title, relatedSlugs);
    }
  } else {
    for (const entry of postIndexEntries) {
      const otherPage = await readWikiPage(entry.slug);
      if (!otherPage) continue;
      if (!otherPage.content.includes(`${slug}.md`)) continue;

      const updated = stripBacklinksTo(slug, otherPage.content);
      if (updated !== otherPage.content) {
        await writeWikiPage(entry.slug, updated);
        strippedBacklinksFrom.push(entry.slug);
      }
    }
  }

  // 5. Log.
  const details = logDetails?.({ crossRefedSlugs, strippedBacklinksFrom });
  await appendToLog(logOp, op.title, details);

  return { slug, crossRefedSlugs, strippedBacklinksFrom, removedFromIndex };
}

/**
 * Delete a wiki page and clean up references to it.
 *
 * Thin wrapper over {@link runPageLifecycleOp} — the actual 5-step dance
 * (unlink → remove index entry → strip backlinks across pages → log) lives
 * in the shared pipeline. See the block comment above `runPageLifecycleOp`
 * for details.
 *
 * Hard delete only — no trash, no undo. Raw source files in `raw/` are
 * intentionally NOT touched (the raw layer is immutable per the founding
 * vision).
 */
export async function deleteWikiPage(
  slug: string,
): Promise<DeletePageResult> {
  validateSlug(slug);

  // Capture the title BEFORE unlinking so the log entry is human-readable.
  const page = await readWikiPage(slug);
  if (!page) {
    throw new Error(`page not found: ${slug}`);
  }
  const title = page.title ?? slug;

  const result = await runPageLifecycleOp(
    slug,
    { kind: "delete", title },
    "delete",
    ({ strippedBacklinksFrom }) =>
      `deleted · stripped backlinks from ${strippedBacklinksFrom.length} page(s)`,
  );

  return {
    slug: result.slug,
    removedFromIndex: result.removedFromIndex,
    strippedBacklinksFrom: result.strippedBacklinksFrom,
  };
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
 *
 * Thin wrapper over {@link runPageLifecycleOp} — the actual 5 steps live in
 * the shared pipeline, which `deleteWikiPage` also flows through.
 */
export async function writeWikiPageWithSideEffects(
  opts: WritePageOptions,
): Promise<WritePageResult> {
  const { slug, title, content, summary, logOp, logDetails } = opts;

  const result = await runPageLifecycleOp(
    slug,
    {
      kind: "write",
      title,
      content,
      summary,
      crossRefSource: opts.crossRefSource,
    },
    logOp,
    ({ crossRefedSlugs }) => logDetails?.({ updatedSlugs: crossRefedSlugs }),
  );

  return { slug: result.slug, updatedSlugs: result.crossRefedSlugs };
}
