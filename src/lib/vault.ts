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
import { slugify } from "./slugify";
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

// ===========================================================================
// Multiple named vaults (commons-first, v1: public)
//
// A user has several named vaults; each is a collection of page references.
// Strict visibility: a PUBLIC vault references public commons pages (live); a
// PRIVATE vault holds owner-only pages (curating into private = clone — v2).
// Membership is explicit (no auto-add). Stored per owner under `vaults:<tenant>`
// as a `Vault[]` with membership inline.
//
// The id is `<tenant>--<name-slug>` so the OWNER TENANT is recoverable from the
// id alone (split on the first `--`) — needed to resolve a `vault:<id>` scope to
// its storage key without a directory scan.
// ===========================================================================

export type VaultVisibility = "public" | "private";

export interface Vault {
  /** `<ownerTenant>--<nameSlug>` — owner tenant recoverable as the `--` prefix. */
  id: string;
  /** Original-case owner handle (display + attribution). */
  owner: string;
  /** Human display name. */
  name: string;
  visibility: VaultVisibility;
  /** Member page slugs, insertion-ordered (most-recent last). */
  slugs: string[];
  created: string;
}

/** Stable vault id from `(owner, name)`. Prefix = the owner's storage tenant. */
export function vaultIdFor(owner: string, name: string): string {
  return `${tenantForOwner(owner)}--${slugify(name)}`;
}

/** The owner tenant encoded in a vault id (everything before the first `--`). */
function tenantOfVaultId(vaultId: string): string {
  const i = vaultId.indexOf("--");
  return i === -1 ? vaultId : vaultId.slice(0, i);
}

/** Whether `handle` owns `vaultId` — an O(1) check on the id's tenant prefix.
 *  Routes use this to authorize vault mutations (no storage read needed). */
export function vaultOwnedBy(vaultId: string, handle: string): boolean {
  return tenantOfVaultId(vaultId) === tenantForOwner(handle);
}

const vaultsKey = (tenant: string) => `vaults:${tenant}`;

/** All vaults owned by a handle (empty when none). Fail-soft. */
export async function listVaults(owner: string): Promise<Vault[]> {
  try {
    const idx = await getStorage().getIndex<Vault[]>(
      vaultsKey(tenantForOwner(owner)),
    );
    return Array.isArray(idx) ? idx : [];
  } catch (err) {
    logger.warn("vault", "vaults index unreadable; treating as empty:", err);
    return [];
  }
}

/** One vault by id (or null). Resolves the owner tenant from the id. */
export async function getVault(vaultId: string): Promise<Vault | null> {
  try {
    const idx = await getStorage().getIndex<Vault[]>(
      vaultsKey(tenantOfVaultId(vaultId)),
    );
    return (Array.isArray(idx) ? idx : []).find((v) => v.id === vaultId) ?? null;
  } catch (err) {
    logger.warn("vault", `getVault failed for "${vaultId}":`, err);
    return null;
  }
}

/** Member slugs of a vault (empty when absent). */
export async function vaultSlugs(vaultId: string): Promise<string[]> {
  return (await getVault(vaultId))?.slugs ?? [];
}

/** Vault ids (owned by `owner`) that contain `slug` — drives the picker state. */
export async function vaultsContaining(
  owner: string,
  slug: string,
): Promise<string[]> {
  return (await listVaults(owner))
    .filter((v) => v.slugs.includes(slug))
    .map((v) => v.id);
}

/**
 * Create a named vault. Idempotent on `(owner, name)`; if the id collides with a
 * different existing vault, a numeric suffix is appended to keep ids unique.
 * Returns the created (or existing) vault.
 */
export async function createVault(
  owner: string,
  name: string,
  visibility: VaultVisibility = "public",
): Promise<Vault> {
  const tenant = tenantForOwner(owner);
  return withFileLock(vaultsKey(tenant), async () => {
    const vaults = await listVaults(owner);
    let id = vaultIdFor(owner, name);
    const existing = vaults.find((v) => v.id === id);
    if (existing) return existing;
    // Uniquify on the rare slug collision (different display name, same slug).
    if (vaults.some((v) => v.id === id)) {
      let n = 2;
      while (vaults.some((v) => v.id === `${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    const vault: Vault = {
      id,
      owner,
      name,
      visibility,
      slugs: [],
      created: new Date().toISOString(),
    };
    await getStorage().putIndex<Vault[]>(vaultsKey(tenant), [...vaults, vault]);
    return vault;
  });
}

/** Mutate one vault in its owner's list (no-op if absent). */
async function mutateVault(
  vaultId: string,
  fn: (v: Vault) => Vault | null,
): Promise<void> {
  const tenant = tenantOfVaultId(vaultId);
  await withFileLock(vaultsKey(tenant), async () => {
    const idx = await getStorage().getIndex<Vault[]>(vaultsKey(tenant));
    const vaults = Array.isArray(idx) ? idx : [];
    const i = vaults.findIndex((v) => v.id === vaultId);
    if (i === -1) return;
    const next = fn({ ...vaults[i], slugs: [...vaults[i].slugs] });
    if (next === null) vaults.splice(i, 1);
    else vaults[i] = next;
    await getStorage().putIndex<Vault[]>(vaultsKey(tenant), vaults);
  });
}

/** Rename a vault (id stays stable). */
export async function renameVault(vaultId: string, name: string): Promise<void> {
  await mutateVault(vaultId, (v) => ({ ...v, name }));
}

/** Delete a vault. */
export async function deleteVault(vaultId: string): Promise<void> {
  await mutateVault(vaultId, () => null);
}

/** Add a page reference to a vault (idempotent). */
export async function addToVault(vaultId: string, slug: string): Promise<void> {
  await mutateVault(vaultId, (v) =>
    v.slugs.includes(slug) ? v : { ...v, slugs: [...v.slugs, slug] },
  );
}

/** Remove a page reference from a vault (no-op if absent). */
export async function removeFromVault(
  vaultId: string,
  slug: string,
): Promise<void> {
  await mutateVault(vaultId, (v) => ({
    ...v,
    slugs: v.slugs.filter((s) => s !== slug),
  }));
}
