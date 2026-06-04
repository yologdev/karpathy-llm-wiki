/**
 * Pure path-resolution helpers. Extracted from config.ts to break
 * the circular dependency between config.ts and storage/index.ts.
 */

/** Base data directory: `DATA_DIR` env var or `process.cwd()`. */
export function getDataDir(): string {
  return process.env.DATA_DIR ?? process.cwd();
}

/** Wiki pages directory: `WIKI_DIR` env var or `<dataDir>/wiki`. */
export function getWikiDir(): string {
  return process.env.WIKI_DIR ?? `${getDataDir()}/wiki`;
}

/** Raw sources directory: `RAW_DIR` env var or `<dataDir>/raw`. */
export function getRawDir(): string {
  return process.env.RAW_DIR ?? `${getDataDir()}/raw`;
}

// ---------------------------------------------------------------------------
// Per-tenant directories (tenant-silos groundwork — see yopedia-concept.md).
// Every tenant's content will live under `tenants/<tenant>/…`. These helpers
// are additive: nothing reads/writes these paths yet (later phases do). The
// tenant is the owner handle.
// ---------------------------------------------------------------------------

/** Root holding every tenant silo: `<dataDir>/tenants`. */
export function getTenantsDir(): string {
  return `${getDataDir()}/tenants`;
}

/** A tenant's wiki directory: `<dataDir>/tenants/<tenant>/wiki`. */
export function getTenantWikiDir(tenant: string): string {
  return `${getTenantsDir()}/${tenant}/wiki`;
}

/** A tenant's raw-sources directory: `<dataDir>/tenants/<tenant>/raw`. */
export function getTenantRawDir(tenant: string): string {
  return `${getTenantsDir()}/${tenant}/raw`;
}
