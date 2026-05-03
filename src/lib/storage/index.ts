/**
 * Storage factory — returns the appropriate StorageProvider for the runtime.
 *
 * Detection logic:
 *   1. Explicit override: `STORAGE_PROVIDER=fs|cloudflare-r2`
 *   2. Cloudflare Workers runtime detection (globalThis.caches?.default)
 *   3. Default: filesystem provider
 *
 * For now only the filesystem provider exists. The Cloudflare R2 provider
 * will be added in a subsequent issue. The factory is designed so that
 * swapping providers requires zero changes in calling code.
 */

import type { StorageProvider } from "./types";

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

type ProviderType = "fs" | "cloudflare-r2";

/**
 * Detect which storage provider to use based on environment.
 *
 * Priority:
 *   1. STORAGE_PROVIDER env var (explicit override for testing / deployment)
 *   2. Cloudflare Workers runtime detection
 *   3. Fallback to filesystem
 */
function detectProvider(): ProviderType {
  // 1. Explicit override
  const override = process.env.STORAGE_PROVIDER;
  if (override === "fs" || override === "cloudflare-r2") {
    return override;
  }

  // 2. Cloudflare Workers runtime heuristic:
  //    Workers have a `caches.default` API that Node.js does not.
  //    We also check for the CF-specific `navigator.userAgent` string.
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as Record<string, unknown>).caches === "object" &&
    (globalThis as Record<string, unknown>).caches !== null &&
    typeof ((globalThis as Record<string, unknown>).caches as Record<string, unknown>).default === "object"
  ) {
    return "cloudflare-r2";
  }

  // 3. Default
  return "fs";
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

let _instance: StorageProvider | null = null;
let _providerType: ProviderType | null = null;

/**
 * Get the storage provider for the current runtime.
 *
 * Returns a singleton — the provider is created once and reused. This
 * matches the current codebase pattern where all modules share the same
 * filesystem root.
 *
 * @throws if the detected provider is not yet implemented
 */
export function getStorage(): StorageProvider {
  const desired = detectProvider();

  // Return cached instance if provider type hasn't changed
  if (_instance && _providerType === desired) {
    return _instance;
  }

  switch (desired) {
    case "fs":
      // Filesystem provider is a stub for now — will be implemented in a
      // follow-up issue that migrates existing fs calls to use this interface.
      throw new Error(
        "FileSystemProvider not yet implemented. " +
        "This interface is Phase 1 (definition only). " +
        "The concrete provider will be added in a subsequent issue."
      );

    case "cloudflare-r2":
      throw new Error(
        "CloudflareR2Provider not yet implemented. " +
        "It will be added when Cloudflare deployment support lands."
      );

    default: {
      const _exhaustive: never = desired;
      throw new Error(`Unknown storage provider: ${_exhaustive}`);
    }
  }
}

/**
 * Reset the singleton — useful for testing or provider hot-swap.
 * @internal
 */
export function _resetStorage(): void {
  _instance = null;
  _providerType = null;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  StorageProvider,
  FileInfo,
  FileWithEtag,
  FileEntry,
  EmbeddingEntry,
  EmbeddingMatch,
} from "./types";
