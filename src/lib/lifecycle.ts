import fs from "fs/promises";
import path from "path";
import type { IndexEntry } from "./types";
import { upsertEmbedding, removeEmbedding } from "./embeddings";
import {
  validateSlug,
  writeWikiPage,
  readWikiPage,
  listWikiPages,
  updateIndexUnsafe,
  findRelatedPages,
  updateRelatedPages,
  appendToLog,
  getWikiDir,
} from "./wiki";
import { withFileLock } from "./lock";
import { escapeRegex } from "./links";
import type { LogOperation } from "./wiki";

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

  // 2b. Update vector index (blocking but failure-tolerant — errors are
  //      logged and swallowed so they never fail the operation).
  try {
    if (op.kind === "write") {
      await upsertEmbedding(slug, op.content);
    } else {
      await removeEmbedding(slug);
    }
  } catch (err) {
    console.warn(
      `[wiki] embedding ${op.kind === "write" ? "upsert" : "remove"} failed for "${slug}":`,
      err instanceof Error ? err.message : err,
    );
  }

  // 3. Mutate the index. The read → mutate → write cycle is performed under
  //    a single withFileLock("index.md") so that concurrent lifecycle ops
  //    cannot clobber each other (TOCTOU race fix). We use updateIndexUnsafe
  //    since we already hold the lock.
  let postIndexEntries: IndexEntry[];
  let removedFromIndex = false;
  await withFileLock("index.md", async () => {
    const entries = await listWikiPages();
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
    await updateIndexUnsafe(postIndexEntries);
  });

  // 4. Cross-reference other pages.
  //    - write: discover related pages and add backlinks TO this slug.
  //    - delete: rewrite every remaining page to strip links to this slug.
  let crossRefedSlugs: string[] = [];
  const strippedBacklinksFrom: string[] = [];
  if (op.kind === "write") {
    if (op.crossRefSource !== null) {
      const sourceForCrossRef = op.crossRefSource ?? op.content;
      // Use entries captured inside the lock to avoid TOCTOU — a concurrent
      // ingest between the lock release and a fresh read could produce stale data.
      const refreshedEntries = postIndexEntries!;
      const relatedSlugs = await findRelatedPages(
        slug,
        sourceForCrossRef,
        refreshedEntries,
      );
      crossRefedSlugs = await updateRelatedPages(slug, op.title, relatedSlugs);
    }
  } else {
    for (const entry of postIndexEntries!) {
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
