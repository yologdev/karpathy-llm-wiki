import type { IndexEntry } from "./types";
import { upsertEmbedding, removeEmbedding } from "./embeddings";
import { deleteRevisions } from "./revisions";
import { deleteDiscussions } from "./talk";
import {
  validateSlug,
  writeWikiPage,
  readWikiPage,
  readWikiPageWithFrontmatter,
  listWikiPages,
  updateIndexUnsafe,
  findRelatedPages,
  updateRelatedPages,
  appendToLog,
  wikiRelPath,
  tenantForOwner,
} from "./wiki";
import { syncSiloForPage, removeSiloForPage } from "./silo";
import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { escapeRegex } from "./links";
import { getErrorMessage } from "./errors";
import { removeAliasForPage, updateAliasIndexForPage } from "./alias-index";
import { removeSourceForPage } from "./source-index";
import { syncCommonsForPage, removeCommonsEntryBySlug, belongsInCommons } from "./commons";
import { syncOwnerIndexForPage, removeOwnerIndexForSlug } from "./owner-index";
import { syncBacklinksForPage, removeBacklinksForSlug } from "./backlink-index";
import { recordEditForAuthor } from "./contributor-index";
import { addVaultRef } from "./vault";
import { parseFrontmatter } from "./frontmatter";
import type { LogOperation } from "./wiki";
import { logger } from "./logger";

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
  /** Who made this change — stored in the revision sidecar for attribution. */
  author?: string;
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
      /** Who made this change — stored in the revision sidecar. */
      author?: string;
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
  //    c) Collapse orphaned commas: "A, , C" → "A, C"
  updated = updated.replace(/,(\s*,)+/g, ",");
  //    d) Fix trailing comma at end-of-line: `..., \n` → `\n`
  updated = updated.replace(/,\s*$/gm, "");
  //    e) Collapse runs of 3+ blank lines that the empty-line removal may
  //       have produced into a single blank line, so we don't leave a hole.
  updated = updated.replace(/\n{3,}/g, "\n\n");

  return updated;
}

/**
 * Shared lifecycle-op pipeline for write and delete. See the block comment
 * above for the full 5-step shape.
 */
/**
 * Map over items with bounded concurrency. Keeps the parallelism win on large
 * wikis without firing thousands of simultaneous R2 subrequests. Order-preserving.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** Max concurrent R2 reads/writes during a page lifecycle op. */
const LIFECYCLE_CONCURRENCY = 12;

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

  // Capture the deleted page's owner BEFORE removing it, so step 3c knows which
  // tenant silo to mirror the removal into (the flat file is gone afterward).
  let deletedOwner: string | undefined;

  // Capture the page's PREVIOUS content before overwrite so the backlink index
  // can diff outbound links (write path). undefined for a brand-new page.
  let prevContent: string | undefined;

  // 2. Mutate the page file.
  if (op.kind === "write") {
    try {
      const pre = await readWikiPage(slug);
      prevContent = pre?.content;
    } catch {
      // No prior page (new) or unreadable → treat as no previous links.
    }
    await writeWikiPage(slug, op.content, op.author);
  } else {
    try {
      const pre = await readWikiPageWithFrontmatter(slug);
      deletedOwner =
        typeof pre?.frontmatter.owner === "string"
          ? pre.frontmatter.owner
          : undefined;
    } catch {
      // Owner unknown → falls back to the default tenant in step 3c.
    }
    try {
      await getStorage().deleteFile(wikiRelPath(`${slug}.md`));
    } catch (err: unknown) {
      // If the file is already gone (concurrent delete), that's fine — treat as success.
      if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
        throw err;
      }
    }
  }

  // 2b–2d. Secondary storage cleanup. All steps are failure-tolerant (logged +
  //        swallowed) so they never fail the op. On the delete path the three
  //        independent ops (embedding, revisions, discussions) run CONCURRENTLY
  //        instead of one-after-another to cut latency.
  if (op.kind === "write") {
    try {
      await upsertEmbedding(slug, op.content);
    } catch (err) {
      logger.warn(
        "wiki",
        `embedding upsert failed for "${slug}":`,
        getErrorMessage(err, String(err)),
      );
    }
  } else {
    const cleanups: { label: string; run: Promise<unknown> }[] = [
      { label: "embedding remove", run: removeEmbedding(slug) },
      { label: "deleteRevisions", run: deleteRevisions(slug) },
      { label: "deleteDiscussions", run: deleteDiscussions(slug) },
    ];
    const settled = await Promise.allSettled(cleanups.map((c) => c.run));
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        logger.warn(
          "wiki",
          `${cleanups[i].label} failed for "${slug}":`,
          getErrorMessage(r.reason, String(r.reason)),
        );
      }
    });
  }

  // 2e. Index maintenance (in-memory, fast).
  if (op.kind === "delete") {
    // Invalidate alias entries so resolveAlias(deletedTitle) no longer
    // ghost-resolves here; drop source-index (URL/content-hash) entries too.
    removeAliasForPage(slug);
    removeSourceForPage(slug);
  } else {
    // 2e. Update alias index for written page so resolveAlias() finds it
    //     immediately — no server restart needed. Parse the frontmatter to
    //     extract aliases[], mirroring how removeAliasForPage() is called
    //     on the delete path.
    try {
      const parsed = parseFrontmatter(op.content);
      const aliases = Array.isArray(parsed.data.aliases)
        ? (parsed.data.aliases as string[]).filter(
            (a) => typeof a === "string" && a.trim() !== "",
          )
        : [];
      updateAliasIndexForPage(slug, op.title, aliases);
    } catch {
      // Frontmatter parse failure should not fail the write — the page is
      // already on disk. The alias index will catch up on next full rebuild.
      logger.warn(
        "wiki",
        `alias index update skipped for "${slug}": could not parse frontmatter`,
      );
    }
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

  // 3b. Mirror into the commons index (tenant-silos groundwork). Maintained
  //     alongside the flat index; not yet read by any surface. Fail-soft — a
  //     commons error must never break the page write/delete.
  try {
    if (op.kind === "delete") {
      await removeCommonsEntryBySlug(slug);
    } else {
      const fm = parseFrontmatter(op.content).data;
      const str = (v: unknown) => (typeof v === "string" ? v : undefined);
      const num = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? v : undefined;
      // source_count is persisted as a string (see ingest.ts).
      const sc = fm.source_count;
      const sourceCount =
        typeof sc === "number"
          ? sc
          : typeof sc === "string" && /^\d+$/.test(sc.trim())
            ? Number.parseInt(sc, 10)
            : undefined;
      // confidence may be a number or a numeric string (mirror listWikiPages).
      const cf = fm.confidence;
      const confidence =
        num(cf) ??
        (typeof cf === "string" && /^-?\d+(\.\d+)?$/.test(cf.trim())
          ? Number.parseFloat(cf)
          : undefined);
      await syncCommonsForPage(slug, {
        owner: str(fm.owner),
        visibility: str(fm.visibility),
        type: str(fm.type),
        title: op.title,
        summary: op.summary,
        tags: Array.isArray(fm.tags)
          ? (fm.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : undefined,
        updated: str(fm.updated),
        sourceCount,
        confidence,
      });
    }
  } catch (err) {
    logger.warn("commons", `commons sync skipped for "${slug}":`, err);
  }

  // 3b-ii. Owner→slugs index (Phase 2 precomputed indexes). Mirrors slugsForOwner's
  //        membership (owner tenant + every contributor tenant). Fail-soft.
  try {
    if (op.kind === "delete") {
      await removeOwnerIndexForSlug(slug);
    } else {
      const fm = parseFrontmatter(op.content).data;
      const owner = typeof fm.owner === "string" ? fm.owner : undefined;
      const contributors = Array.isArray(fm.contributors)
        ? (fm.contributors as unknown[]).filter((c): c is string => typeof c === "string")
        : undefined;
      await syncOwnerIndexForPage(slug, owner, contributors);
    }
  } catch (err) {
    logger.warn("owner-index", `owner index sync skipped for "${slug}":`, err);
  }

  // 3b-iii. Backlink (reverse-link) index. On write, diff this page's outbound
  //         links against its previous content (captured before overwrite); on
  //         delete, drop the slug as both target and source. Fail-soft.
  try {
    if (op.kind === "delete") {
      await removeBacklinksForSlug(slug);
    } else {
      await syncBacklinksForPage(slug, op.content, prevContent);
    }
  } catch (err) {
    logger.warn("backlink-index", `backlink index sync skipped for "${slug}":`, err);
  }

  // 3b-iv. Contributor index — incremental edit facts only. We bump editCount /
  //         pagesEdited / firstSeen / lastSeen for op.author (decrement on
  //         delete); revertCount and talk counts are left to the daily rebuild
  //         (see contributor-index.ts header). No-op until the daily rebuild has
  //         seeded the index (recordEditForAuthor returns early when absent).
  //         Fail-soft.
  try {
    if (op.kind === "delete") {
      // The author of the deleted revision isn't on the delete op; the daily
      // rebuild reconciles per-author counts. We still drop the page from any
      // author's pagesEdited via the rebuild. (No per-author decrement here.)
    } else if (op.author) {
      await recordEditForAuthor(op.author, slug);
    }
  } catch (err) {
    logger.warn("contributor-index", `contributor index sync skipped for "${slug}":`, err);
  }

  // 3c. Mirror the page into its per-tenant silo — a live, self-contained vault
  //     (`tenants/<tenant>/…`, Obsidian-servable). A derived per-page mirror of
  //     flat (the write primary); fail-soft so a silo error never breaks the
  //     write/delete. Reads from flat, so this runs AFTER the flat mutation.
  try {
    if (op.kind === "delete") {
      await removeSiloForPage(slug, tenantForOwner(deletedOwner));
    } else {
      const o = parseFrontmatter(op.content).data.owner;
      const owner = typeof o === "string" ? o : undefined;
      await syncSiloForPage(slug, tenantForOwner(owner));
    }
  } catch (err) {
    logger.warn("silo", `silo mirror skipped for "${slug}":`, err);
  }

  // 3d. Auto-add the page into its owner's vault — the commons-first reference
  //     lens. A contributor's own commons pages show in their vault without a
  //     manual curate (ingest-into-my-vault). Owner-keyed, commons-only (public,
  //     non-agent), humans-only (skip "system" and agent-owned `a--b` handles).
  //     Idempotent + fail-soft — a vault error must never break the write.
  try {
    if (op.kind !== "delete") {
      const fm = parseFrontmatter(op.content).data;
      const owner = typeof fm.owner === "string" ? fm.owner.trim() : "";
      const isCommons = belongsInCommons({
        visibility: typeof fm.visibility === "string" ? fm.visibility : undefined,
        type: typeof fm.type === "string" ? fm.type : undefined,
      });
      if (owner && owner !== "system" && !owner.includes("--") && isCommons) {
        await addVaultRef(owner, slug);
      }
    }
  } catch (err) {
    logger.warn("vault", `vault auto-ref skipped for "${slug}":`, err);
  }

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
    // Strip links to the deleted page from every other page. Read all pages
    // CONCURRENTLY (bounded) — this was the main sequential bottleneck and the
    // part that scaled badly with page count. Then rewrite only the linkers.
    const pages = await mapWithConcurrency(
      postIndexEntries!,
      LIFECYCLE_CONCURRENCY,
      async (entry) => ({ entry, page: await readWikiPage(entry.slug) }),
    );
    const linkers = pages.filter(
      ({ page }) => page && page.content.includes(`${slug}.md`),
    );
    await mapWithConcurrency(linkers, LIFECYCLE_CONCURRENCY, async ({ entry, page }) => {
      const updated = stripBacklinksTo(slug, page!.content);
      if (updated !== page!.content) {
        await writeWikiPage(entry.slug, updated);
        strippedBacklinksFrom.push(entry.slug);
      }
    });
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
      author: opts.author,
    },
    logOp,
    ({ crossRefedSlugs }) => logDetails?.({ updatedSlugs: crossRefedSlugs }),
  );

  return { slug: result.slug, updatedSlugs: result.crossRefedSlugs };
}
