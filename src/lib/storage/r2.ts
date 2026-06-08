/**
 * R2StorageProvider — Cloudflare R2/KV/Vectorize-backed implementation of
 * the StorageProvider interface.
 *
 * Maps the abstract storage operations to Cloudflare's services:
 *   - Text files + assets → R2 Bucket
 *   - Derived indexes → KV Namespace
 *   - Embeddings → Vectorize Index (optional, falls back to KV)
 *
 * R2 is a flat key-value store, so "directories" are simulated using
 * key prefixes and the R2 `list()` delimiter feature.
 */

import type {
  StorageProvider,
  FileInfo,
  FileWithEtag,
  FileEntry,
  EmbeddingMatch,
  EmbeddingEntry,
} from "./types";

import type {
  CloudflareEnv,
  R2Bucket,
  KVNamespace,
  VectorizeIndex,
} from "./cloudflare-types";
import { logger } from "../logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** R2 list() returns at most 1000 keys per call. */
const R2_LIST_PAGE_SIZE = 1000;

/** KV key prefix for index entries. */
const INDEX_PREFIX = "_idx:";

/** KV key for fallback embedding store when Vectorize is unavailable. */
const EMBEDDINGS_KV_KEY = "_idx:embeddings";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class R2StorageProvider implements StorageProvider {
  private readonly bucket: R2Bucket;
  private readonly kv: KVNamespace;
  private readonly vectorize: VectorizeIndex | undefined;

  constructor(env: CloudflareEnv) {
    this.bucket = env.YOPEDIA_BUCKET;
    this.kv = env.YOPEDIA_CONFIG;
    this.vectorize = env.YOPEDIA_VECTORIZE;
  }

  // -------------------------------------------------------------------------
  // Text files
  // -------------------------------------------------------------------------

  async readFile(path: string): Promise<string> {
    const obj = await this.bucket.get(path);
    if (!obj) {
      throw new R2NotFoundError(path);
    }
    return obj.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.bucket.put(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    // R2 delete is silent on missing keys, matching the interface contract
    await this.bucket.delete(path);
  }

  async listFiles(prefix: string): Promise<FileEntry[]> {
    // Ensure prefix ends with "/" for directory listing
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

    const entries: FileEntry[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({
        prefix: normalizedPrefix,
        delimiter: "/",
        cursor,
        limit: R2_LIST_PAGE_SIZE,
      });

      // Files: extract the name portion after the prefix
      for (const obj of result.objects) {
        const name = obj.key.slice(normalizedPrefix.length);
        // Skip empty names (the prefix itself) or nested entries
        if (name && !name.includes("/")) {
          entries.push({ name, isDirectory: false });
        }
      }

      // Directories: delimitedPrefixes are full prefixes like "wiki/assets/"
      for (const dp of result.delimitedPrefixes) {
        const name = dp.slice(normalizedPrefix.length).replace(/\/$/, "");
        if (name) {
          entries.push({ name, isDirectory: true });
        }
      }

      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return entries;
  }

  async fileExists(path: string): Promise<boolean> {
    const head = await this.bucket.head(path);
    return head !== null;
  }

  async appendFile(path: string, content: string): Promise<void> {
    // R2 has no native append — read-modify-write
    const existing = await this.bucket.get(path);
    const oldContent = existing ? await existing.text() : "";
    await this.bucket.put(path, oldContent + content);
  }

  async stat(path: string): Promise<FileInfo> {
    const head = await this.bucket.head(path);
    if (!head) {
      throw new R2NotFoundError(path);
    }
    return {
      size: head.size,
      lastModified: head.uploaded,
    };
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    // R2 is flat — "delete directory" means delete all keys with this prefix
    const normalizedPrefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({
        prefix: normalizedPrefix,
        cursor,
        limit: R2_LIST_PAGE_SIZE,
      });

      if (result.objects.length > 0) {
        const keys = result.objects.map((obj) => obj.key);
        await this.bucket.delete(keys);
      }

      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
  }

  // -------------------------------------------------------------------------
  // Assets (binary data)
  // -------------------------------------------------------------------------

  async writeAsset(path: string, data: ArrayBuffer): Promise<void> {
    await this.bucket.put(path, data);
  }

  async readAsset(path: string): Promise<ArrayBuffer> {
    const obj = await this.bucket.get(path);
    if (!obj) {
      throw new R2NotFoundError(path);
    }
    return obj.arrayBuffer();
  }

  // -------------------------------------------------------------------------
  // Optimistic concurrency
  // -------------------------------------------------------------------------

  async readFileWithEtag(path: string): Promise<FileWithEtag> {
    const obj = await this.bucket.get(path);
    if (!obj) {
      throw new R2NotFoundError(path);
    }
    return {
      content: await obj.text(),
      etag: obj.httpEtag,
    };
  }

  async writeFileIfMatch(
    path: string,
    content: string,
    etag: string,
  ): Promise<boolean> {
    // R2 conditional put: returns null if the condition fails
    const result = await this.bucket.put(path, content, {
      onlyIf: { etagMatches: etag },
    });
    return result !== null;
  }

  // -------------------------------------------------------------------------
  // Derived indexes (KV-backed)
  // -------------------------------------------------------------------------

  async getIndex<T = unknown>(key: string): Promise<T | null> {
    const value = await this.kv.get(`${INDEX_PREFIX}${key}`, "json");
    return (value as T) ?? null;
  }

  async putIndex<T = unknown>(key: string, value: T): Promise<void> {
    await this.kv.put(`${INDEX_PREFIX}${key}`, JSON.stringify(value));
  }

  // -------------------------------------------------------------------------
  // Embeddings / vector search
  // -------------------------------------------------------------------------

  async upsertEmbedding(
    id: string,
    vector: number[],
    metadata: Record<string, string>,
  ): Promise<void> {
    if (this.vectorize) {
      await this.vectorize.upsert([{ id, values: vector, metadata }]);
    } else {
      // Fallback: store in KV as a JSON blob (same approach as filesystem)
      const entries = await this.loadEmbeddingsFromKV();
      const idx = entries.findIndex((e) => e.id === id);
      const entry = { id, vector, metadata };
      if (idx >= 0) {
        entries[idx] = entry;
      } else {
        entries.push(entry);
      }
      await this.kv.put(EMBEDDINGS_KV_KEY, JSON.stringify(entries));
    }
  }

  async queryEmbeddings(
    vector: number[],
    topK: number,
  ): Promise<EmbeddingMatch[]> {
    if (this.vectorize) {
      const result = await this.vectorize.query(vector, {
        topK,
        returnMetadata: "all",
      });
      return result.matches.map((m) => ({
        id: m.id,
        score: m.score,
        metadata: (m.metadata as Record<string, string>) ?? {},
      }));
    }

    // Fallback: brute-force cosine similarity in KV
    const entries = await this.loadEmbeddingsFromKV();
    const scored = entries.map((e) => ({
      id: e.id,
      score: cosineSimilarity(vector, e.vector),
      metadata: e.metadata,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async getEmbeddingById(id: string): Promise<EmbeddingEntry | null> {
    if (this.vectorize) {
      const got = await this.vectorize.getByIds([id]);
      const v = got?.[0];
      return v
        ? { id: v.id, vector: v.values, metadata: v.metadata ?? {} }
        : null;
    }
    const entries = await this.loadEmbeddingsFromKV();
    const e = entries.find((x) => x.id === id);
    return e ? { id: e.id, vector: e.vector, metadata: e.metadata } : null;
  }

  async removeEmbedding(id: string): Promise<void> {
    if (this.vectorize) {
      await this.vectorize.deleteByIds([id]);
    } else {
      const entries = await this.loadEmbeddingsFromKV();
      const filtered = entries.filter((e) => e.id !== id);
      await this.kv.put(EMBEDDINGS_KV_KEY, JSON.stringify(filtered));
    }
  }

  async clearEmbeddings(): Promise<void> {
    if (this.vectorize) {
      // Vectorize has no bulk-clear primitive (deleting by id needs the full id
      // list, which we don't track). After a content reset every page is gone,
      // so orphaned vectors are filtered out at query time anyway — a full purge
      // means recreating the index. Best-effort no-op here, by design — but log
      // it so a caller (admin reset) isn't silently reporting success for a clear
      // the managed index didn't actually perform.
      logger.warn(
        "storage",
        "clearEmbeddings: Vectorize has no bulk-clear; vectors left in place " +
          "(filtered at query time). Recreate the index to fully purge.",
      );
      return;
    }
    await this.kv.put(EMBEDDINGS_KV_KEY, JSON.stringify([]));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async loadEmbeddingsFromKV(): Promise<
    Array<{ id: string; vector: number[]; metadata: Record<string, string> }>
  > {
    const data = await this.kv.get(EMBEDDINGS_KV_KEY, "json");
    if (!data) return [];
    return data as Array<{
      id: string;
      vector: number[];
      metadata: Record<string, string>;
    }>;
  }
}

// ---------------------------------------------------------------------------
// Error class for missing R2 objects
// ---------------------------------------------------------------------------

/**
 * Error thrown when an R2 object is not found. Mimics Node.js ENOENT
 * errors so existing error-handling code (`isEnoent()`) continues to work.
 */
export class R2NotFoundError extends Error {
  readonly code = "ENOENT";

  constructor(path: string) {
    super(`ENOENT: no such file or directory, open '${path}'`);
    this.name = "R2NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity (for KV fallback when Vectorize is unavailable)
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
