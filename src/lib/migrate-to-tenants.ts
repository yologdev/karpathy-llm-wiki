/**
 * One-shot migration to per-tenant silos (tenant-silos P1b).
 *
 * COPIES every page's artifacts into `tenants/<tenant>/…` (it does NOT delete
 * the flat originals), builds per-tenant `index.md` files + the commons index,
 * and persists an old→new redirect map. Because it only copies, the existing
 * flat read paths keep working unchanged — so running this is additive and
 * reversible (delete the `tenants/` prefix to undo). A later sub-phase switches
 * reads to the tenant/commons layout, then a cleanup removes the flat copies.
 *
 * Idempotent + resumable: re-running overwrites the same destinations. Run with
 * `{ dryRun: true }` first to see the per-tenant plan + redirect map with no
 * writes.
 *
 * READ-SWITCH PRECONDITIONS (the later phase that flips reads must honor these):
 *  - Only switch when a live run returns `errors.length === 0`. On partial
 *    failure a tenant's `index.md`/commons can list a page whose silo file
 *    failed to copy — re-run until clean before switching.
 *  - This only ADDS; a page deleted/renamed between runs leaves a stale orphan
 *    file in the silo (absent from the rebuilt index, but directly reachable).
 *    The read-switch should reconcile/clean orphans.
 *  - Raw sources are assumed to be `<slug>.md` (always true today). If a
 *    non-`.md` raw source ever exists, copy by stripped-extension match.
 */

import { getStorage } from "./storage";
import { logger } from "./logger";
import type { IndexEntry } from "./types";
import {
  listWikiPages,
  tenantWikiRelPath,
  tenantForOwner,
} from "./wiki";
import { rebuildCommonsIndex } from "./commons";
import { syncSiloForPage } from "./silo";

/** The index + log are infrastructure, not pages — never migrated as pages. */
const SKIP_SLUGS = new Set(["index", "log"]);
const REDIRECT_MAP_KEY = "redirect-map";

export interface RedirectEntry {
  from: string;
  to: string;
}

export interface MigrationResult {
  dryRun: boolean;
  totalPages: number;
  /** pages per tenant */
  tenants: Record<string, number>;
  artifactsCopied: number;
  commonsCount: number;
  redirectCount: number;
  errors: string[];
}

/** Migrate (copy) all flat content into per-tenant silos. Dry-run by default. */
export async function migrateToTenants(
  opts: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const dryRun = opts.dryRun ?? true;
  const storage = getStorage();
  const pages = (await listWikiPages()).filter((p) => !SKIP_SLUGS.has(p.slug));

  const tenants: Record<string, number> = {};
  const byTenant = new Map<string, IndexEntry[]>();
  const redirectMap: RedirectEntry[] = [];
  const errors: string[] = [];
  let artifactsCopied = 0;

  for (const page of pages) {
    const tenant = tenantForOwner(page.owner);
    tenants[tenant] = (tenants[tenant] ?? 0) + 1;
    const list = byTenant.get(tenant) ?? [];
    list.push(page);
    byTenant.set(tenant, list);
    redirectMap.push({ from: `/wiki/${page.slug}`, to: `/u/${tenant}/${page.slug}` });

    if (dryRun) continue;
    try {
      artifactsCopied += await syncSiloForPage(page.slug, tenant);
    } catch (e) {
      errors.push(`copy ${page.slug}: ${String(e)}`);
      logger.warn("migrate", `copy failed for "${page.slug}"`, e);
    }
  }

  let commonsCount = 0;
  if (!dryRun) {
    // Per-tenant index.md (same `- [Title](slug.md) — summary` format).
    for (const [tenant, entries] of byTenant) {
      const lines = entries.map(
        (e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`,
      );
      const content = `# Wiki Index\n\n${lines.join("\n")}\n`;
      try {
        await storage.writeFile(tenantWikiRelPath(tenant, "index.md"), content);
      } catch (e) {
        errors.push(`index ${tenant}: ${String(e)}`);
      }
    }
    // Derived commons index + the old→new redirect map.
    try {
      commonsCount = await rebuildCommonsIndex();
    } catch (e) {
      errors.push(`commons: ${String(e)}`);
    }
    try {
      await storage.putIndex(REDIRECT_MAP_KEY, redirectMap);
    } catch (e) {
      errors.push(`redirect-map: ${String(e)}`);
    }
  }

  return {
    dryRun,
    totalPages: pages.length,
    tenants,
    artifactsCopied,
    commonsCount,
    redirectCount: redirectMap.length,
    errors,
  };
}

/** Read the persisted old→new redirect map (empty until a live migration runs). */
export async function getRedirectMap(): Promise<RedirectEntry[]> {
  const m = await getStorage().getIndex<RedirectEntry[]>(REDIRECT_MAP_KEY);
  return Array.isArray(m) ? m : [];
}
