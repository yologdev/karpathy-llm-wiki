/**
 * Per-tenant silo mirror (tenant-silos P5a).
 *
 * Each tenant's folder `tenants/<tenant>/…` is kept as a live, complete mirror
 * of that owner's pages — a self-contained vault (Obsidian-servable). Flat
 * storage stays the write/read primary; the silo is a DERIVED per-page mirror
 * synced on every lifecycle write/delete (the same fail-soft pattern as the
 * commons index). The one-shot migration backfills it; this module keeps it
 * current going forward.
 *
 * Artifacts mirrored per page: wiki md, raw source, revision history, discussion
 * threads, and binary assets. The embedding vector store is internal (not part
 * of the vault) and stays global.
 */

import { getStorage } from "./storage";
import { isEnoent } from "./errors";
import {
  wikiRelPath,
  rawRelPath,
  tenantWikiRelPath,
  tenantRawRelPath,
  validateTenant,
} from "./wiki";

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

async function deleteSafe(path: string): Promise<void> {
  try {
    await getStorage().deleteFile(path);
  } catch (e) {
    if (!isEnoent(e)) throw e;
  }
}

async function deleteDirSafe(path: string): Promise<void> {
  try {
    await getStorage().deleteDirectory(path);
  } catch (e) {
    if (!isEnoent(e)) throw e;
  }
}

/**
 * Mirror every per-page artifact for one slug into its tenant silo (idempotent
 * — overwrites). Reads from flat (the write primary), so call AFTER the flat
 * write completes. Returns the count of artifacts copied.
 */
export async function syncSiloForPage(
  slug: string,
  tenant: string,
): Promise<number> {
  validateTenant(tenant);
  let n = 0;
  // wiki page + raw source
  if (await copyText(wikiRelPath(`${slug}.md`), tenantWikiRelPath(tenant, `${slug}.md`)))
    n++;
  if (await copyText(rawRelPath(`${slug}.md`), tenantRawRelPath(tenant, `${slug}.md`)))
    n++;

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
  if (
    await copyText(
      `discuss/${slug}.json`,
      `tenants/${tenant}/discuss/${slug}.json`,
    )
  )
    n++;

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

/** Remove every per-page artifact for one slug from its tenant silo. */
export async function removeSiloForPage(
  slug: string,
  tenant: string,
): Promise<void> {
  validateTenant(tenant);
  await Promise.all([
    deleteSafe(tenantWikiRelPath(tenant, `${slug}.md`)),
    deleteSafe(tenantRawRelPath(tenant, `${slug}.md`)),
    deleteSafe(`tenants/${tenant}/discuss/${slug}.json`),
    deleteDirSafe(tenantWikiRelPath(tenant, `.revisions/${slug}`)),
    deleteDirSafe(tenantRawRelPath(tenant, `assets/${slug}`)),
  ]);
}
