/**
 * Autonomous maintenance scan (Q2) — the producer side of the upkeep no human
 * reports. A cron (on the task-consumer worker) calls `/api/tasks/scan`, which
 * runs this scan and enqueues `maintain` tasks (or dry-runs when autonomous
 * maintenance is off). Two ops, chosen for safety + reuse of proven engines:
 *
 *   - **reconcile**: a `disputed` page with an OPEN thread whose latest comment
 *     is from a HUMAN (so yoyo hasn't already answered and is waiting) → run the
 *     same `reconcileFromTalk` as the on-demand button.
 *   - **staleness**: a page past its `expiry` with a `source_url` → re-ingest
 *     from the source (the reconcile-on-merge step refreshes it).
 *   - **fix** (deterministic, no LLM): backfill a legacy page missing all
 *     yopedia schema fields (`unmigrated-page`); clear a dangling `supersedes`
 *     reference (`supersedes-dangling`); drop an index entry whose page file is
 *     gone (`stale-index`). These reuse the lint auto-fixes (`lint-fix.ts`).
 *
 * Guardrails (because no human is watching each one):
 *   - **commons-only**: skip PRIVATE pages entirely. Autonomous maintenance
 *     tends the shared commons; a private vault is the owner's, reached only via
 *     the on-demand button (the owner asking). This also avoids a cost loop: a
 *     private page reingested by a generic agent forks (the realm guard) instead
 *     of refreshing, leaving the original to be re-flagged every scan;
 *   - skip pages updated TODAY (don't act on a just-edited page);
 *   - skip disputed threads yoyo already answered (last comment is an agent) —
 *     avoids re-reconciling a stuck dispute on every scan;
 *   - cap the number of tasks per scan (cost + blast-radius bound).
 */

import { listWikiPages, readWikiPageWithFrontmatter } from "./wiki";
import { getOnDiskSlugs } from "./lint-checks";
import { listThreads } from "./talk";
import { isAgentHandle } from "./agents";
import { extractWikiLinks } from "./links";
import type { Task } from "./tasks";
import { logger } from "./logger";

/** Default cap on maintenance tasks enqueued per scan. */
export const DEFAULT_MAINTENANCE_CAP = 10;

/**
 * Scan the wiki's state and return up to `cap` `maintain` tasks. Read-only — the
 * caller enqueues (or dry-runs) the result. At most one task per page per scan.
 */
export async function scanForMaintenance(
  cap: number = DEFAULT_MAINTENANCE_CAP,
): Promise<Task[]> {
  const today = new Date().toISOString().slice(0, 10);
  const tasks: Task[] = [];
  const pages = await listWikiPages();
  const pageSlugs = new Set(pages.map((p) => p.slug));

  // ── Orphan-page detection (file on disk, no index entry) ──
  const diskSlugs = await getOnDiskSlugs("");
  for (const slug of diskSlugs) {
    if (tasks.length >= cap) break;
    if (!pageSlugs.has(slug)) {
      tasks.push({
        kind: "maintain",
        op: "fix",
        slug,
        lintType: "orphan-page",
      });
    }
  }

  for (const entry of pages) {
    if (tasks.length >= cap) break;
    if (entry.slug === "index" || entry.slug === "log") continue; // infra

    const page = await readWikiPageWithFrontmatter(entry.slug);
    if (!page) {
      // Index entry with no page file → stale-index. The fix re-verifies the
      // file is genuinely missing before dropping the entry, so a transient
      // read miss is safe.
      tasks.push({
        kind: "maintain",
        op: "fix",
        slug: entry.slug,
        lintType: "stale-index",
      });
      continue;
    }
    const fm = page.frontmatter;

    // Commons-only: never autonomously touch a private vault page (privacy +
    // avoids the reingest-fork cost loop). The owner reaches it via the button.
    if (fm.visibility === "private") continue;

    // Guardrail: skip a page edited today (let recent changes settle).
    if (typeof fm.updated === "string" && fm.updated === today) continue;

    // (1) Disputed → reconcile, but only when a HUMAN is awaiting a response
    //     (the latest comment on an open thread isn't yoyo's).
    if (fm.disputed === true) {
      const threads = await listThreads(entry.slug);
      const idx = threads.findIndex(
        (t) =>
          t.status === "open" &&
          t.comments.length > 0 &&
          !isAgentHandle(t.comments[t.comments.length - 1].author),
      );
      if (idx >= 0) {
        tasks.push({ kind: "maintain", op: "reconcile", slug: entry.slug, threadIndex: idx });
        continue; // one task per page
      }
    }

    // (2) Deterministic janitorial fixes (no LLM, safe): backfill a legacy page
    //     missing ALL yopedia schema fields; clear a dangling `supersedes` ref.
    if (
      !("confidence" in fm) &&
      !("authors" in fm) &&
      !("expiry" in fm)
    ) {
      tasks.push({ kind: "maintain", op: "fix", slug: entry.slug, lintType: "unmigrated-page" });
      continue;
    }
    const supersedes = fm.supersedes;
    if (
      typeof supersedes === "string" &&
      supersedes !== "" &&
      !pageSlugs.has(supersedes)
    ) {
      tasks.push({ kind: "maintain", op: "fix", slug: entry.slug, lintType: "supersedes-dangling" });
      continue;
    }

    // (2b) Broken internal wiki links → one task per dead link (deterministic fix
    //      removes the markdown link, leaving the anchor text). `extractWikiLinks`
    //      finds `[text](slug.md)` patterns; we emit a task for each target slug
    //      that doesn't exist.
    const wikiLinks = extractWikiLinks(page.content);
    let emittedBrokenLink = false;
    for (const link of wikiLinks) {
      if (tasks.length >= cap) break;
      if (!pageSlugs.has(link.targetSlug)) {
        tasks.push({
          kind: "maintain",
          op: "fix",
          slug: entry.slug,
          lintType: "broken-link",
          targetSlug: link.targetSlug,
        });
        emittedBrokenLink = true;
      }
    }
    if (emittedBrokenLink) continue;

    // (2c) Empty pages — no meaningful content (blank body or just a title).
    //      The fix deletes the page. Match lint-checks' 50-char threshold.
    const strippedBody = page.body.replace(/^#\s+.+$/m, "").trim();
    if (strippedBody.length < 50) {
      tasks.push({
        kind: "maintain",
        op: "fix",
        slug: entry.slug,
        lintType: "empty-page",
      });
      continue;
    }

    // (3) Stale (expiry passed) with a source to refresh from → re-ingest.
    const expiry = fm.expiry;
    const sourceUrl = fm.source_url;
    if (
      typeof expiry === "string" &&
      expiry !== "" &&
      expiry <= today &&
      typeof sourceUrl === "string" &&
      sourceUrl.trim() !== ""
    ) {
      tasks.push({ kind: "maintain", op: "staleness", slug: entry.slug });
    }
  }

  logger.info("maintenance", `scan found ${tasks.length} task(s) (cap ${cap})`);
  return tasks;
}

// ---------------------------------------------------------------------------
// Precomputed-index self-heal (Phase 2)
// ---------------------------------------------------------------------------
//
// The five derived KV indexes (owner-slugs, backlinks, discuss-stats,
// contributors) are maintained incrementally on the write/talk paths. Drift can
// still creep in (a failed fail-soft update, an out-of-band edit, the coarse
// contributor fields left to rebuild). This rebuilds all five from ground truth
// in one daily pass so any drift self-corrects. Fully fail-soft — each rebuild
// is independent and a failure never aborts the others or the maintenance scan.

/** Rebuild all five precomputed indexes. Returns a per-index ok/error summary. */
export async function rebuildDerivedIndexes(): Promise<
  Record<string, { ok: boolean; error?: string }>
> {
  const results: Record<string, { ok: boolean; error?: string }> = {};
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["owner-slugs", async () => (await import("./owner-index")).rebuildOwnerIndex()],
    ["backlinks", async () => (await import("./backlink-index")).rebuildBacklinkIndex()],
    ["discuss-stats", async () => (await import("./discuss-stats-index")).rebuildDiscussStatsIndex()],
    ["contributors", async () => (await import("./contributor-index")).rebuildContributorIndex()],
    ["recent", async () => (await import("./recent-index")).rebuildRecentIndex()],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
      results[name] = { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn("maintenance", `index rebuild failed for "${name}":`, error);
      results[name] = { ok: false, error };
    }
  }
  logger.info(
    "maintenance",
    `derived index rebuild: ${Object.entries(results)
      .map(([k, v]) => `${k}=${v.ok ? "ok" : "fail"}`)
      .join(" ")}`,
  );
  return results;
}
