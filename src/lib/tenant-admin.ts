/**
 * Per-tenant admin ops (tenant-silos P5c).
 */

import { listWikiPages, tenantForOwner, validateTenant } from "./wiki";
import { deleteWikiPage } from "./lifecycle";
import { getStorage } from "./storage";
import { isEnoent } from "./errors";
import { logger } from "./logger";

export interface DeleteTenantResult {
  tenant: string;
  /** Pages hard-deleted (owned by this tenant). */
  deletedPages: number;
  errors: string[];
}

/**
 * Hard-delete a tenant's entire content: every page it OWNS — flat file, the
 * per-page silo mirror, revisions, discussion, embeddings, and commons entry
 * (all via {@link deleteWikiPage}) — plus the tenant's silo folder. Owner is
 * matched by TENANT, so ownerless/seed pages belong to "yopedia". Pages the
 * handle only CONTRIBUTED to (owned by another tenant) are never touched.
 *
 * Best-effort: a per-page failure is collected in `errors` and the rest proceed,
 * so one bad page can't strand the deletion.
 */
export async function deleteTenant(handle: string, actor?: string): Promise<DeleteTenantResult> {
  const tenant = tenantForOwner(handle);
  // Defense in depth before an irreversible prefix `rm -rf`: ownerToTenant
  // already strips path-unsafe chars, but the storage layer has no traversal
  // guard of its own, so assert the tenant can't contain a separator/`..`.
  validateTenant(tenant);
  const errors: string[] = [];

  // Owner-only slugs — NOT contributors, so we never delete another tenant's
  // page. (index/log are infrastructure, not pages.)
  const owned = (await listWikiPages())
    .filter(
      (p) =>
        p.slug !== "index" &&
        p.slug !== "log" &&
        tenantForOwner(p.owner) === tenant,
    )
    .map((p) => p.slug);

  let deletedPages = 0;
  for (const slug of owned) {
    try {
      await deleteWikiPage(slug, actor ?? "admin");
      deletedPages++;
    } catch (e) {
      errors.push(`delete ${slug}: ${String(e)}`);
      logger.warn("tenant-admin", `failed to delete "${slug}"`, e);
    }
  }

  // Remove the silo folder itself (any orphans + the now-empty tree). Fail-soft.
  try {
    await getStorage().deleteDirectory(`tenants/${tenant}`);
  } catch (e) {
    if (!isEnoent(e)) {
      errors.push(`silo dir: ${String(e)}`);
      logger.warn("tenant-admin", `failed to remove silo dir for "${tenant}"`, e);
    }
  }

  return { tenant, deletedPages, errors };
}
