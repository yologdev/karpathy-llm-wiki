import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import type { EmbeddingModel } from "ai";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getWikiDir, listWikiPages, readWikiPage } from "./wiki";
import { loadConfigSync } from "./config";
import { withFileLock } from "./lock";
import { MAX_EMBED_CHARS } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorEntry {
  slug: string;
  embedding: number[];
  /** MD5 hash of the page content — used to detect stale embeddings */
  contentHash: string;
}

export interface VectorStore {
  /** e.g. "text-embedding-3-small" — if model changes, invalidate all */
  model: string;
  entries: VectorEntry[];
}

// ---------------------------------------------------------------------------
// Embedding provider detection
// ---------------------------------------------------------------------------

/**
 * Default embedding models per provider. Can be overridden with the
 * `EMBEDDING_MODEL` env var.
 */
const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
  openai: "text-embedding-3-small",
  google: "gemini-embedding-001",
  ollama: "nomic-embed-text",
};

/** Providers that support embeddings (i.e. everything except Anthropic). */
const EMBEDDING_CAPABLE_PROVIDERS = new Set(["openai", "google", "ollama"]);

/**
 * Returns the name of the currently selected embedding model, or null if no
 * embedding-capable provider is configured.
 *
 * Resolution order for model name:
 *   1. `EMBEDDING_MODEL` env var (highest priority)
 *   2. `config.embeddingModel` from config file
 *   3. Provider-specific default
 *
 * Resolution order for provider:
 *   1. Env var API keys (highest priority)
 *   2. Config file provider + apiKey
 */
export function getEmbeddingModelName(): string | null {
  const override = process.env.EMBEDDING_MODEL;

  // --- Env var provider detection (existing, highest priority) ---
  if (process.env.OPENAI_API_KEY) {
    return override ?? DEFAULT_EMBEDDING_MODELS.openai;
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return override ?? DEFAULT_EMBEDDING_MODELS.google;
  }
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    return override ?? DEFAULT_EMBEDDING_MODELS.ollama;
  }

  // --- Config file fallback ---
  const cfg = loadConfigSync();
  const cfgProvider = cfg.provider;
  if (cfgProvider && EMBEDDING_CAPABLE_PROVIDERS.has(cfgProvider)) {
    // Ollama is keyless; others need an apiKey in config
    if (cfgProvider === "ollama" || cfg.apiKey) {
      return override ?? cfg.embeddingModel ?? DEFAULT_EMBEDDING_MODELS[cfgProvider] ?? null;
    }
  }

  // Anthropic has no embedding models — skip it entirely.
  // No embedding-capable provider configured.
  return null;
}

/**
 * Returns an AI SDK embedding model based on the configured provider, or
 * `null` if the provider doesn't support embeddings.
 *
 * Provider detection order:
 *   1. OpenAI    (OPENAI_API_KEY env var)
 *   2. Google    (GOOGLE_GENERATIVE_AI_API_KEY env var)
 *   3. Ollama    (OLLAMA_BASE_URL / OLLAMA_MODEL env var)
 *   4. Config file (provider + apiKey, if provider is openai/google/ollama)
 *   5. No key    → null
 *
 * Model name resolution:
 *   1. `EMBEDDING_MODEL` env var (highest)
 *   2. `config.embeddingModel` from config file
 *   3. Provider-specific default
 */
export function getEmbeddingModel(): EmbeddingModel | null {
  const override = process.env.EMBEDDING_MODEL;

  // --- Env var provider detection (existing, highest priority) ---

  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai.embedding(override ?? DEFAULT_EMBEDDING_MODELS.openai);
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google.embedding(override ?? DEFAULT_EMBEDDING_MODELS.google);
  }

  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    const ollama = process.env.OLLAMA_BASE_URL
      ? createOllama({ baseURL: process.env.OLLAMA_BASE_URL })
      : createOllama();
    return ollama.embedding(override ?? DEFAULT_EMBEDDING_MODELS.ollama);
  }

  // --- Config file fallback ---
  const cfg = loadConfigSync();
  const cfgProvider = cfg.provider;

  if (cfgProvider && EMBEDDING_CAPABLE_PROVIDERS.has(cfgProvider)) {
    if (cfgProvider === "openai" && cfg.apiKey) {
      const openai = createOpenAI({ apiKey: cfg.apiKey });
      return openai.embedding(
        override ?? cfg.embeddingModel ?? DEFAULT_EMBEDDING_MODELS.openai,
      );
    }

    if (cfgProvider === "google" && cfg.apiKey) {
      const google = createGoogleGenerativeAI({ apiKey: cfg.apiKey });
      return google.embedding(
        override ?? cfg.embeddingModel ?? DEFAULT_EMBEDDING_MODELS.google,
      );
    }

    if (cfgProvider === "ollama") {
      const ollama = cfg.ollamaBaseUrl
        ? createOllama({ baseURL: cfg.ollamaBaseUrl })
        : createOllama();
      return ollama.embedding(
        override ?? cfg.embeddingModel ?? DEFAULT_EMBEDDING_MODELS.ollama,
      );
    }
  }

  // Anthropic has no embedding models.
  // No embedding-capable provider configured.
  return null;
}

/**
 * Returns true if an embedding-capable provider is configured.
 */
export function hasEmbeddingSupport(): boolean {
  return getEmbeddingModelName() !== null;
}

// ---------------------------------------------------------------------------
// Embed helpers
// ---------------------------------------------------------------------------

/**
 * Embed a single text string. Returns null if no embedding provider is
 * configured.
 *
 * Long texts are truncated to {@link MAX_EMBED_CHARS} before being sent to
 * the model to stay within provider token limits.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const model = getEmbeddingModel();
  if (!model) return null;

  const truncated = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  const result = await embed({ model, value: truncated });
  return result.embedding;
}

/**
 * Batch-embed multiple text strings. Returns null if no embedding provider is
 * configured.
 *
 * Each text is truncated to {@link MAX_EMBED_CHARS} before being sent to the
 * model.
 */
export async function embedTexts(
  texts: string[],
): Promise<number[][] | null> {
  const model = getEmbeddingModel();
  if (!model) return null;

  const truncated = texts.map((t) =>
    t.length > MAX_EMBED_CHARS ? t.slice(0, MAX_EMBED_CHARS) : t,
  );
  const result = await embedMany({ model, values: truncated });
  return result.embeddings;
}

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/** Compute a simple MD5 hex hash of content — used to detect stale embeddings. */
export function contentHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Vector store persistence
// ---------------------------------------------------------------------------

const VECTOR_STORE_FILENAME = ".vectors.json";

/** Path to the vector store file on disk. */
function vectorStorePath(): string {
  return path.join(getWikiDir(), VECTOR_STORE_FILENAME);
}

/**
 * Read the vector store from disk. Returns null if the file doesn't exist.
 */
export async function loadVectorStore(): Promise<VectorStore | null> {
  try {
    const raw = await fs.readFile(vectorStorePath(), "utf-8");
    return JSON.parse(raw) as VectorStore;
  } catch (err) {
    console.warn("[embeddings] load vector store failed:", err);
    return null;
  }
}

/**
 * Write the vector store to disk atomically. Creates the wiki directory if
 * needed.  Writes to a `.tmp` file first, then renames — so a crash mid-write
 * cannot corrupt the store (rename is atomic on POSIX).
 */
export async function saveVectorStore(store: VectorStore): Promise<void> {
  const dir = getWikiDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = vectorStorePath();
  const tmp = dest + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf-8");
  await fs.rename(tmp, dest);
}

// ---------------------------------------------------------------------------
// Vector store operations
// ---------------------------------------------------------------------------

/**
 * Embed content for a wiki page and upsert it into the vector store.
 *
 * - Skips re-embedding if the contentHash hasn't changed.
 * - If the stored model name differs from the current model, all existing
 *   entries are cleared (model migration).
 */
export async function upsertEmbedding(
  slug: string,
  content: string,
): Promise<void> {
  return withFileLock("vectors", async () => {
    const modelName = getEmbeddingModelName();
    if (!modelName) return; // No embedding support

    const hash = contentHash(content);
    let store = await loadVectorStore();

    // Model migration: if the stored model doesn't match, start fresh.
    if (store && store.model !== modelName) {
      store = { model: modelName, entries: [] };
    }

    if (!store) {
      store = { model: modelName, entries: [] };
    }

    // Check if already up-to-date
    const existing = store.entries.find((e) => e.slug === slug);
    if (existing && existing.contentHash === hash) {
      return; // Already embedded with same content
    }

    // Embed the content
    const embedding = await embedText(content);
    if (!embedding) return;

    // Upsert
    if (existing) {
      existing.embedding = embedding;
      existing.contentHash = hash;
    } else {
      store.entries.push({ slug, embedding, contentHash: hash });
    }

    await saveVectorStore(store);
  });
}

/**
 * Remove a slug's embedding from the vector store.
 */
export async function removeEmbedding(slug: string): Promise<void> {
  return withFileLock("vectors", async () => {
    const store = await loadVectorStore();
    if (!store) return;

    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.slug !== slug);

    if (store.entries.length !== before) {
      await saveVectorStore(store);
    }
  });
}

// ---------------------------------------------------------------------------
// Vector math
// ---------------------------------------------------------------------------

/**
 * Compute the cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical, 0 = orthogonal, -1 = opposite.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
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
// Vector search
// ---------------------------------------------------------------------------

/**
 * Embed the query text, then compute cosine similarity against all stored
 * vectors and return the top-K results sorted by score (descending).
 *
 * Returns an empty array if no embedding support is available, the store
 * is empty, or the store was built with a different embedding model (stale
 * embeddings would produce meaningless similarity scores).
 */
export async function searchByVector(
  query: string,
  topK: number = 10,
): Promise<Array<{ slug: string; score: number }>> {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  const store = await loadVectorStore();
  if (!store || store.entries.length === 0) return [];

  // Guard: if the store was built with a different model the embeddings are
  // incompatible — return nothing.  The store will be rebuilt on the next
  // upsert or manual rebuild.
  const currentModel = getEmbeddingModelName();
  if (currentModel && store.model !== currentModel) return [];

  const scored = store.entries.map((entry) => ({
    slug: entry.slug,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ---------------------------------------------------------------------------
// Full vector store rebuild
// ---------------------------------------------------------------------------

export interface RebuildResult {
  total: number;
  embedded: number;
  skipped: number;
  model: string;
}

/**
 * Rebuild the entire vector store from scratch.
 *
 * Lists all wiki pages, embeds each page's content, and saves a completely
 * new vector store — replacing whatever was on disk before.
 *
 * Throws if no embedding provider is configured.
 *
 * @param onProgress Optional callback invoked after each page is processed.
 */
export async function rebuildVectorStore(
  onProgress?: (done: number, total: number) => void,
): Promise<RebuildResult> {
  const modelName = getEmbeddingModelName();
  if (!modelName) {
    throw new Error(
      "No embedding provider configured. Set up OpenAI, Google, or Ollama in Settings.",
    );
  }

  const entries = await listWikiPages();
  const total = entries.length;

  const store: VectorStore = { model: modelName, entries: [] };
  let embedded = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const page = await readWikiPage(entry.slug);

    if (!page || !page.content || page.content.trim().length === 0) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    try {
      const embedding = await embedText(page.content);
      if (!embedding) {
        skipped++;
        onProgress?.(i + 1, total);
        continue;
      }

      store.entries.push({
        slug: entry.slug,
        embedding,
        contentHash: contentHash(page.content),
      });
      embedded++;
    } catch (err) {
      console.warn(`[embeddings] embed page "${entry.slug}" failed:`, err);
      skipped++;
    }

    onProgress?.(i + 1, total);
  }

  await withFileLock("vectors", async () => {
    await saveVectorStore(store);
  });

  return { total, embedded, skipped, model: modelName };
}
