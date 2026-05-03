/**
 * FilesystemStorageProvider — wraps Node.js `fs` behind the StorageProvider
 * interface.
 *
 * All paths passed to methods are resolved relative to the `basePath` given
 * at construction time. This is the concrete provider used when running on
 * Node.js (i.e. not on Cloudflare Workers).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type {
  StorageProvider,
  FileInfo,
  FileWithEtag,
  FileEntry,
  EmbeddingEntry,
  EmbeddingMatch,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cosine similarity between two equal-length vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class FilesystemStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /** Resolve a relative path against the base. */
  private resolve(rel: string): string {
    return path.resolve(this.basePath, rel);
  }

  /** Ensure parent directory exists for a file path. */
  private async ensureParent(absPath: string): Promise<void> {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
  }

  // -------------------------------------------------------------------------
  // Text files
  // -------------------------------------------------------------------------

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(this.resolve(filePath), "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const abs = this.resolve(filePath);
    await this.ensureParent(abs);
    await fs.writeFile(abs, content, "utf-8");
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(this.resolve(filePath));
  }

  async listFiles(prefix: string): Promise<FileEntry[]> {
    const abs = this.resolve(prefix);
    try {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    } catch (err: unknown) {
      // If the directory doesn't exist, return empty list
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    const abs = this.resolve(filePath);
    await this.ensureParent(abs);
    await fs.appendFile(abs, content, "utf-8");
  }

  async stat(filePath: string): Promise<FileInfo> {
    const st = await fs.stat(this.resolve(filePath));
    return {
      size: st.size,
      lastModified: st.mtime,
    };
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    await fs.rm(this.resolve(dirPath), { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  // Assets (binary data)
  // -------------------------------------------------------------------------

  async writeAsset(filePath: string, data: ArrayBuffer): Promise<void> {
    const abs = this.resolve(filePath);
    await this.ensureParent(abs);
    await fs.writeFile(abs, Buffer.from(data));
  }

  async readAsset(filePath: string): Promise<ArrayBuffer> {
    const buf = await fs.readFile(this.resolve(filePath));
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  }

  // -------------------------------------------------------------------------
  // Optimistic concurrency
  // -------------------------------------------------------------------------

  async readFileWithEtag(filePath: string): Promise<FileWithEtag> {
    const abs = this.resolve(filePath);
    const [content, st] = await Promise.all([
      fs.readFile(abs, "utf-8"),
      fs.stat(abs),
    ]);
    return {
      content,
      etag: `${st.mtime.getTime()}-${st.size}`,
    };
  }

  async writeFileIfMatch(
    filePath: string,
    content: string,
    etag: string,
  ): Promise<boolean> {
    const abs = this.resolve(filePath);
    try {
      const st = await fs.stat(abs);
      const currentEtag = `${st.mtime.getTime()}-${st.size}`;
      if (currentEtag !== etag) {
        return false;
      }
    } catch (err: unknown) {
      // File doesn't exist — etag can't match
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw err;
    }

    await this.ensureParent(abs);
    await fs.writeFile(abs, content, "utf-8");
    return true;
  }

  // -------------------------------------------------------------------------
  // Derived indexes
  // -------------------------------------------------------------------------

  private indexPath(key: string): string {
    return this.resolve(path.join(".indexes", `${key}.json`));
  }

  async getIndex<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.indexPath(key), "utf-8");
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async putIndex<T = unknown>(key: string, value: T): Promise<void> {
    const abs = this.indexPath(key);
    await this.ensureParent(abs);
    await fs.writeFile(abs, JSON.stringify(value), "utf-8");
  }

  // -------------------------------------------------------------------------
  // Embeddings / vector search
  // -------------------------------------------------------------------------

  private embeddingsPath(): string {
    return this.indexPath("embeddings");
  }

  private async loadEmbeddings(): Promise<EmbeddingEntry[]> {
    try {
      const raw = await fs.readFile(this.embeddingsPath(), "utf-8");
      return JSON.parse(raw) as EmbeddingEntry[];
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  private async saveEmbeddings(entries: EmbeddingEntry[]): Promise<void> {
    const abs = this.embeddingsPath();
    await this.ensureParent(abs);
    await fs.writeFile(abs, JSON.stringify(entries), "utf-8");
  }

  async upsertEmbedding(
    id: string,
    vector: number[],
    metadata: Record<string, string>,
  ): Promise<void> {
    const entries = await this.loadEmbeddings();
    const idx = entries.findIndex((e) => e.id === id);
    const entry: EmbeddingEntry = { id, vector, metadata };
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    await this.saveEmbeddings(entries);
  }

  async queryEmbeddings(
    vector: number[],
    topK: number,
  ): Promise<EmbeddingMatch[]> {
    const entries = await this.loadEmbeddings();
    const scored = entries.map((e) => ({
      id: e.id,
      score: cosineSimilarity(vector, e.vector),
      metadata: e.metadata,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async removeEmbedding(id: string): Promise<void> {
    const entries = await this.loadEmbeddings();
    const filtered = entries.filter((e) => e.id !== id);
    await this.saveEmbeddings(filtered);
  }
}
