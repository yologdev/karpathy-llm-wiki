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
import { isEnoent } from "./errors";
import { logger } from "./logger";
import type { IndexEntry } from "./types";
import {
  listWikiPages,
  wikiRelPath,
  rawRelPath,
  tenantWikiRelPath,
  tenantRawRelPath,
  tenantForOwner,
} from "./wiki";
import { rebuildCommonsIndex } from "./commons";

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

async function copyText(src: string, dst: string): Promise<boolean> {
  const storage = getStorage();
  let content: string;
  try {
    content = await storage.readFile(src);
  } catch (e) {
    if (isEnoent(e)) return false;
    throw e;
  }
  await storage.writeFile(dst, content);
  return true;
}

async function copyAsset(src: string, dst: string): Promise<boolean> {
  const storage = getStorage();
  let data: ArrayBuffer;
  try {
    data = await storage.readAsset(src);
  } catch (e) {
    if (isEnoent(e)) return false;
    throw e;
  }
  await storage.writeAsset(dst, data);
  return true;
}

async function listSafe(prefix: string) {
  try {
    return await getStorage().listFiles(prefix);
  } catch (e) {
    if (isEnoent(e)) return [];
    throw e;
  }
}

/** Copy every per-page artifact for one slug into its tenant. */
async function copyPageArtifacts(slug: string, tenant: string): Promise<number> {
  let n = 0;
  // wiki page + raw source
  if (await copyText(wikiRelPath(`${slug}.md`), tenantWikiRelPath(tenant, `${slug}.md`))) n++;
  if (await copyText(rawRelPath(`${slug}.md`), tenantRawRelPath(tenant, `${slug}.md`))) n++;

  // revision history: wiki/.revisions/<slug>/{<ts>.md,<ts>.meta.json}
  for (const f of await listSafe(wikiRelPath(`.revisions/${slug}`))) {
    if (f.isDirectory) continue;
    if (
      await copyText(
        wikiRelPath(`.revisions/${slug}/${f.name}`),
        tenantWikiRelPath(tenant, `.revisions/${slug}/${f.name}`),
      )
    )
      n++;
  }

  // discussion threads: discuss/<slug>.json
  if (await copyText(`discuss/${slug}.json`, `tenants/${tenant}/discuss/${slug}.json`)) n++;

  // binary assets: raw/assets/<slug>/<file>
  for (const f of await listSafe(rawRelPath(`assets/${slug}`))) {
    if (f.isDirectory) continue;
    if (
      await copyAsset(
        rawRelPath(`assets/${slug}/${f.name}`),
        tenantRawRelPath(tenant, `assets/${slug}/${f.name}`),
      )
    )
      n++;
  }
  return n;
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
      artifactsCopied += await copyPageArtifacts(page.slug, tenant);
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
