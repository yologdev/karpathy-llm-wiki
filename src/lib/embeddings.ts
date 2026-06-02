import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { EmbeddingModel } from "ai";
import type { Ai } from "./storage/cloudflare-types";
import { wikiRelPath, listWikiPages, readWikiPage } from "./wiki";
import { getStorage } from "./storage";
import { detectEnvProvider, loadConfigSync, getEmbeddingModelOverride, getOllamaBaseUrl } from "./config";
import { EMBEDDING_PROVIDERS, isEmbeddingProvider, type EmbeddingProvider } from "./providers";
import { withFileLock } from "./lock";
import { isEnoent } from "./errors";
import { MAX_EMBED_CHARS } from "./constants";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorEntry {
  slug: string;
  embedding: number[];
  /** Hash of the page content — used to detect stale embeddings */
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
const DEFAULT_EMBEDDING_MODELS: Record<EmbeddingProvider, string> = {
  openai: "text-embedding-3-small",
  google: "gemini-embedding-001",
  ollama: "nomic-embed-text",
  // Workers AI BGE-M3: multilingual (strong CJK/Chinese), 1024-dim.
  "workers-ai": "@cf/baai/bge-m3",
};

/** Workers AI model ids are namespaced with this prefix (e.g. @cf/baai/...). */
const WORKERS_AI_MODEL_PREFIX = "@cf/";

/**
 * Return the Cloudflare Workers AI binding if available, else null.
 *
 * `getCloudflareContext()` throws when called outside the Workers request
 * scope (local CLI, Node tests) — that case is expected and stays silent. But
 * being on the Workers runtime with the `AI` binding *unbound* is a
 * misconfiguration, not "no embeddings", so we surface it with a warning
 * rather than silently degrading to BM25-only search.
 */
function getWorkersAiBinding(): Ai | null {
  let env: { AI?: Ai };
  try {
    ({ env } = getCloudflareContext() as { env: { AI?: Ai } });
  } catch {
    // Expected off the Workers runtime — silent by design.
    return null;
  }
  if (!env.AI) {
    logger.warn(
      "embeddings",
      "On the Workers runtime but the AI binding is not bound — embeddings " +
        "will fall back to the LLM provider or be disabled. Check the `ai` " +
        "binding in wrangler.jsonc.",
    );
    return null;
  }
  return env.AI;
}

/**
 * Resolve which provider to use for embeddings — independent of the LLM
 * provider, so generation can run on a provider with no embedding models
 * (e.g. deepseek) while embeddings run on Workers AI.
 *
 * Priority:
 *   1. Explicit override — `EMBEDDING_PROVIDER` env var, then
 *      `config.embeddingProvider`. An override that isn't embedding-capable
 *      is rejected (returns null) and warned about — it does NOT fall through.
 *   2. Workers AI auto-detect — on the CF runtime with the `AI` binding bound.
 *   3. The LLM provider detected from env vars, if embedding-capable; otherwise
 *      `config.provider` only when it is `ollama` (the one keyless provider —
 *      other config providers need an env-var API key, handled by step 3a).
 */
function resolveEmbeddingProvider(
  cfg: ReturnType<typeof loadConfigSync>,
): EmbeddingProvider | null {
  const override = process.env.EMBEDDING_PROVIDER ?? cfg.embeddingProvider;
  if (override) {
    if (isEmbeddingProvider(override)) return override;
    logger.warn(
      "embeddings",
      `EMBEDDING_PROVIDER="${override}" is not embedding-capable ` +
        `(valid: ${EMBEDDING_PROVIDERS.join(", ")}); embeddings are disabled. ` +
        "Fix the override or unset it to auto-detect.",
    );
    return null;
  }

  // Auto-select Workers AI when its binding is available.
  if (getWorkersAiBinding()) return "workers-ai";

  // Fall back to the configured LLM provider when it supports embeddings.
  const env = detectEnvProvider();
  if (env.provider && isEmbeddingProvider(env.provider)) {
    return env.provider;
  }
  if (cfg.provider === "ollama") return "ollama";

  return null;
}

/** Resolve the API key for an embedding provider from its own env var. */
function embeddingApiKeyFor(provider: EmbeddingProvider): string | null {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY ?? null;
    case "google":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null;
    default:
      return null; // ollama and workers-ai are keyless
  }
}

/**
 * Resolve the embedding model name for a provider.
 *
 * Priority: `EMBEDDING_MODEL` env → `config.embeddingModel` → provider default.
 *
 * The override is only honored when it belongs to the resolved provider's
 * namespace — Workers AI ids start with `@cf/`, the AI-SDK providers don't.
 * This prevents a stale override left over from a previous provider (e.g.
 * `EMBEDDING_MODEL=text-embedding-3-small`) from leaking into a Workers AI
 * call (or vice versa) and producing an invalid model id.
 */
function resolveEmbeddingModelName(
  provider: EmbeddingProvider,
  cfg: ReturnType<typeof loadConfigSync>,
): string {
  const override = getEmbeddingModelOverride() ?? cfg.embeddingModel;
  if (override) {
    const overrideIsWorkersAi = override.startsWith(WORKERS_AI_MODEL_PREFIX);
    const providerIsWorkersAi = provider === "workers-ai";
    if (overrideIsWorkersAi === providerIsWorkersAi) return override;
    // Namespace mismatch — ignore the override and use the provider default.
  }
  return DEFAULT_EMBEDDING_MODELS[provider] ?? provider;
}

/**
 * Returns the name of the currently selected embedding model, or null if no
 * embedding-capable provider is configured.
 *
 * Provider is resolved by {@link resolveEmbeddingProvider} (override →
 * Workers AI auto-detect → LLM provider). Model name resolution:
 *   1. `EMBEDDING_MODEL` env var (highest priority)
 *   2. `config.embeddingModel` from config file
 *   3. Provider-specific default
 */
export function getEmbeddingModelName(): string | null {
  const cfg = loadConfigSync();
  const provider = resolveEmbeddingProvider(cfg);
  if (!provider) return null;
  return resolveEmbeddingModelName(provider, cfg);
}

/**
 * Returns an AI SDK embedding model for the resolved embedding provider, or
 * `null` if the provider doesn't support embeddings or is Workers AI (which
 * is called via the binding, not the AI SDK).
 *
 * Provider is resolved by {@link resolveEmbeddingProvider}; the API key comes
 * from {@link embeddingApiKeyFor} (the embedding provider's own env var, so it
 * works even when the LLM provider differs).
 */
export function getEmbeddingModel(): EmbeddingModel | null {
  const cfg = loadConfigSync();
  const provider = resolveEmbeddingProvider(cfg);

  // Workers AI is not an AI SDK provider — it is called via the binding in
  // {@link embedText}/{@link embedTexts}, so there is no EmbeddingModel here.
  if (!provider || provider === "workers-ai") return null;

  const modelName = resolveEmbeddingModelName(provider, cfg);
  return _createEmbeddingModel(provider, embeddingApiKeyFor(provider), modelName);
}

/**
 * Internal helper to construct an AI SDK embedding model instance.
 *
 * Ollama base URL is resolved via `getOllamaBaseUrl()` from the config layer.
 */
function _createEmbeddingModel(
  provider: string,
  apiKey: string | null,
  modelName: string,
): EmbeddingModel | null {
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey: apiKey! });
      return openai.embedding(modelName);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: apiKey! });
      return google.embedding(modelName);
    }
    case "ollama": {
      // Resolve Ollama base URL via centralized config layer.
      const baseURL = getOllamaBaseUrl();
      const ollama = baseURL ? createOllama({ baseURL }) : createOllama();
      return ollama.embedding(modelName);
    }
    default:
      return null;
  }
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
  const cfg = loadConfigSync();
  const provider = resolveEmbeddingProvider(cfg);
  if (!provider) return null;

  const truncated = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;

  if (provider === "workers-ai") {
    const vectors = await runWorkersAiEmbedding([truncated], cfg);
    return vectors?.[0] ?? null;
  }

  const model = getEmbeddingModel();
  if (!model) return null;
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
  const cfg = loadConfigSync();
  const provider = resolveEmbeddingProvider(cfg);
  if (!provider) return null;

  const truncated = texts.map((t) =>
    t.length > MAX_EMBED_CHARS ? t.slice(0, MAX_EMBED_CHARS) : t,
  );

  if (provider === "workers-ai") {
    return runWorkersAiEmbedding(truncated, cfg);
  }

  const model = getEmbeddingModel();
  if (!model) return null;
  const result = await embedMany({ model, values: truncated });
  return result.embeddings;
}

/**
 * Embed one or more texts via the Cloudflare Workers AI binding
 * (e.g. `@cf/baai/bge-m3`). Returns null if the binding is unavailable or the
 * response shape is unexpected.
 */
async function runWorkersAiEmbedding(
  texts: string[],
  cfg: ReturnType<typeof loadConfigSync>,
): Promise<number[][] | null> {
  const ai = getWorkersAiBinding();
  if (!ai) return null;

  const model = resolveEmbeddingModelName("workers-ai", cfg);
  // `pooling: "cls"` — Cloudflare recommends CLS pooling for bge-m3; the
  // default ("mean") produces lower-quality embeddings.
  const result = await ai.run(model, { text: texts, pooling: "cls" });
  if (!Array.isArray(result?.data)) {
    logger.warn(
      "embeddings",
      `Workers AI embedding (${model}) returned an unexpected response ` +
        "shape (no data array) — treating as no embedding:",
      result,
    );
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/**
 * Compute a fast, deterministic hex hash of content — used to detect stale
 * embeddings (not for security). Uses FNV-1a which is pure JS and works in
 * any runtime (Node.js, Cloudflare Workers, browsers).
 *
 * Returns a 16-char hex string (two 32-bit FNV-1a hashes: one from the start,
 * one from the end of the string, concatenated for better distribution).
 */
export function contentHash(content: string): string {
  // FNV-1a 32-bit
  const fnv1a = (s: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  // Two passes for better collision resistance on content-change detection:
  // forward hash + reverse hash concatenated
  const fwd = fnv1a(content);
  const rev = fnv1a(content.split("").reverse().join(""));
  return fwd.toString(16).padStart(8, "0") + rev.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Vector store persistence
// ---------------------------------------------------------------------------

const VECTOR_STORE_FILENAME = ".vectors.json";

/** Storage-relative path to the vector store file. */
function vectorStoreRelPath(): string {
  return wikiRelPath(VECTOR_STORE_FILENAME);
}

/**
 * Read the vector store from disk. Returns null if the file doesn't exist.
 */
export async function loadVectorStore(): Promise<VectorStore | null> {
  try {
    const raw = await getStorage().readFile(vectorStoreRelPath());
    return JSON.parse(raw) as VectorStore;
  } catch (err) {
    if (!isEnoent(err)) {
      logger.warn("embeddings", "load vector store failed:", err);
    }
    return null;
  }
}

/**
 * Write the vector store to disk atomically.
 *
 * The StorageProvider's `writeFile` handles directory creation and atomicity
 * (the filesystem provider uses write-to-tmp + rename internally).
 */
export async function saveVectorStore(store: VectorStore): Promise<void> {
  await getStorage().writeFile(
    vectorStoreRelPath(),
    JSON.stringify(store, null, 2),
  );
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
      "No embedding provider configured. Set up OpenAI, Google, Ollama, or " +
        "Cloudflare Workers AI (bind AI for @cf/baai/bge-m3) in Settings.",
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
      logger.warn("embeddings", `embed page "${entry.slug}" failed:`, err);
      skipped++;
    }

    onProgress?.(i + 1, total);
  }

  await withFileLock("vectors", async () => {
    await saveVectorStore(store);
  });

  return { total, embedded, skipped, model: modelName };
}
