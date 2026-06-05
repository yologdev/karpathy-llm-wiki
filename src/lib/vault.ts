/**
 * Per-user **vault** — a personal *reference lens* over the commons.
 *
 * In the commons-first model (see `yopedia-concept.md`) public content has one
 * home: the collective commons. A user's public vault is NOT separate storage —
 * it's a curated set of **references** to commons pages. "Curating" a page adds
 * its slug here; the page itself stays single and collective, so a curated entry
 * is always live (never a stale copy).
 *
 * Stored as a derived index keyed `vault:<tenant>` (tenant = the normalized
 * owner handle, same key space as the commons/silo), holding the list of
 * curated commons slugs. Fail-soft on read so a missing/corrupt index never
 * breaks a profile render.
 */

import { getStorage } from "./storage";
import { withFileLock } from "./lock";
import { tenantForOwner } from "./wiki";
import { logger } from "./logger";

/** The stored shape of one user's vault. */
interface VaultIndex {
  /** Curated commons slugs, insertion-ordered (most-recent last). */
  slugs: string[];
}

/** Derived-index key for a handle's vault (`_idx:vault:<tenant>` on R2). */
function vaultKey(handle: string): string {
  return `vault:${tenantForOwner(handle)}`;
}

/** Lock key for a handle's vault writes (per-user, so no cross-user contention). */
function vaultLock(handle: string): string {
  return `vault:${tenantForOwner(handle)}`;
}

/**
 * Read a handle's curated commons slugs (empty array when absent). Fail-soft: a
 * missing or corrupt index returns `[]` rather than throwing.
 */
export async function getVaultRefs(handle: string): Promise<string[]> {
  try {
    const idx = await getStorage().getIndex<VaultIndex>(vaultKey(handle));
    return Array.isArray(idx?.slugs) ? idx.slugs : [];
  } catch (err) {
    logger.warn("vault", "vault index unreadable; treating as empty:", err);
    return [];
  }
}

/** Whether a slug is already curated into a handle's vault. */
export async function isInVault(handle: string, slug: string): Promise<boolean> {
  return (await getVaultRefs(handle)).includes(slug);
}

/**
 * Curate a commons slug into a handle's vault (idempotent — a duplicate add is a
 * no-op). The caller is responsible for verifying the slug is a readable commons
 * page; this only maintains the reference list.
 */
export async function addVaultRef(handle: string, slug: string): Promise<void> {
  await withFileLock(vaultLock(handle), async () => {
    const slugs = await getVaultRefs(handle);
    if (slugs.includes(slug)) return;
    slugs.push(slug);
    await getStorage().putIndex<VaultIndex>(vaultKey(handle), { slugs });
  });
}

/** Remove a curated slug from a handle's vault (no-op if absent). */
export async function removeVaultRef(
  handle: string,
  slug: string,
): Promise<void> {
  await withFileLock(vaultLock(handle), async () => {
    const slugs = await getVaultRefs(handle);
    const next = slugs.filter((s) => s !== slug);
    if (next.length !== slugs.length) {
      await getStorage().putIndex<VaultIndex>(vaultKey(handle), { slugs: next });
    }
  });
}
