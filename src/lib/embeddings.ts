import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { EmbeddingModel } from "ai";
import type { Ai } from "./storage/cloudflare-types";
import { listWikiPages, readWikiPage } from "./wiki";
import { getStorage } from "./storage";
import { detectEnvProvider, loadConfigSync, getEmbeddingModelOverride, getOllamaBaseUrl } from "./config";
import { EMBEDDING_PROVIDERS, isEmbeddingProvider, type EmbeddingProvider } from "./providers";
import { withFileLock } from "./lock";
import { MAX_EMBED_CHARS } from "./constants";
import { logger } from "./logger";

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
export function getWorkersAiBinding(): Ai | null {
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
//
// Vectors live in the StorageProvider's embedding store (Cloudflare Vectorize
// in production, KV brute-force when Vectorize is unbound, a local JSON file in
// dev/tests). Each vector carries `EmbeddingMeta` in its metadata: `model` (to
// drop vectors from a stale embedding model on read) and `contentHash` (to skip
// re-embedding unchanged content on write).

/** Per-vector metadata persisted alongside the embedding. */
interface EmbeddingMeta extends Record<string, string> {
  model: string;
  contentHash: string;
}

/** Drop matches whose stored model differs from the active one (stale vectors). */
function modelMatches(metadata: Record<string, string>, model: string | null): boolean {
  // Unknown active model or unlabelled legacy vector → don't filter it out.
  return !model || !metadata.model || metadata.model === model;
}

/**
 * Log a failed vector query at the right severity. A dimension mismatch is
 * BENIGN — it's the expected throw mid model-migration, while the store still
 * holds vectors of the previous dimension — so it warns. Anything else (an
 * unbound/misconfigured Vectorize binding, an outage, a quota error) means
 * vector search is actually down and silently degrading to BM25, so it escalates
 * to error to reach the log sink rather than whisper.
 */
function logVectorQueryFailure(fn: string, err: unknown): void {
  const benign = err instanceof Error && /dimension mismatch/i.test(err.message);
  logger[benign ? "warn" : "error"]("embeddings", `${fn} query failed:`, err);
}

/** Remove every stored embedding (used by the admin content reset). */
export async function clearEmbeddings(): Promise<void> {
  await withFileLock("vectors", async () => {
    await getStorage().clearEmbeddings();
  });
}

// ---------------------------------------------------------------------------
// Vector store operations
// ---------------------------------------------------------------------------

/**
 * Embed content for a wiki page and upsert it into the vector store.
 *
 * Skips re-embedding when the stored vector already has the same contentHash AND
 * was produced by the current embedding model; otherwise re-embeds and upserts
 * (with `{ model, contentHash }` metadata). A model change is handled per-entry:
 * stale-model vectors are simply re-embedded as pages are touched, and dropped
 * from reads in the meantime (see {@link searchByVector}/{@link relatedByVector}).
 */
export async function upsertEmbedding(
  slug: string,
  content: string,
): Promise<void> {
  return withFileLock("vectors", async () => {
    const modelName = getEmbeddingModelName();
    if (!modelName) return; // No embedding support

    const hash = contentHash(content);

    // Skip when the stored vector already matches this content AND model — same
    // optimization as before, now via a single id lookup instead of a full scan.
    const existing = await getStorage().getEmbeddingById(slug);
    if (
      existing &&
      existing.metadata.contentHash === hash &&
      existing.metadata.model === modelName
    ) {
      return;
    }

    const embedding = await embedText(content);
    if (!embedding) return;

    const meta: EmbeddingMeta = { model: modelName, contentHash: hash };
    await getStorage().upsertEmbedding(slug, embedding, meta);
  });
}

/**
 * Remove a slug's embedding from the vector store.
 */
export async function removeEmbedding(slug: string): Promise<void> {
  return withFileLock("vectors", async () => {
    await getStorage().removeEmbedding(slug);
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

  const currentModel = getEmbeddingModelName();
  // A query can throw on a dimension mismatch (e.g. mid model-migration, when
  // the store still holds vectors of the previous dimension). Degrade to "no
  // vector results" rather than propagating — callers fuse/fall back on [].
  try {
    const matches = await getStorage().queryEmbeddings(queryEmbedding, topK);
    const kept = matches.filter((m) => modelMatches(m.metadata, currentModel));
    // If the store returned hits but the model filter dropped ALL of them, the
    // active model name has drifted from what every stored vector was embedded
    // with — vector search is silently disabled until a re-embed/rebuild. Leave
    // a breadcrumb so that's diagnosable rather than looking like "no matches".
    if (matches.length > 0 && kept.length === 0) {
      logger.warn(
        "embeddings",
        `searchByVector: all ${matches.length} matches dropped by the model filter ` +
          `(active="${currentModel}") — likely embedding-model drift; rebuild embeddings.`,
      );
    }
    return kept.map((m) => ({ slug: m.id, score: m.score }));
  } catch (err) {
    logVectorQueryFailure("searchByVector", err);
    return [];
  }
}

/**
 * Find pages most similar to an EXISTING page, reusing its already-stored
 * vector — no embedding call, so it's cheap enough to run on every page render.
 *
 * Returns top-K other pages by cosine similarity (descending). Returns an empty
 * array if there's no store, the page has no stored vector, or the store was
 * built with a different model (stale embeddings → meaningless scores). Does NOT
 * enforce visibility — callers must filter to readable pages.
 */
export async function relatedByVector(
  slug: string,
  topK: number = 10,
): Promise<Array<{ slug: string; score: number }>> {
  const self = await getStorage().getEmbeddingById(slug);
  if (!self) return [];

  const currentModel = getEmbeddingModelName();
  if (!modelMatches(self.metadata, currentModel)) return [];

  // Over-fetch by one to absorb the page's own vector, then drop it. A query can
  // throw on a dimension mismatch (mixed-dimension store mid model-migration);
  // this runs unguarded on the article render path (findSimilarPages), so
  // degrade to "no related pages" rather than failing the page.
  try {
    const matches = await getStorage().queryEmbeddings(self.vector, topK + 1);
    return matches
      .filter((m) => m.id !== slug && modelMatches(m.metadata, currentModel))
      .slice(0, topK)
      .map((m) => ({ slug: m.id, score: m.score }));
  } catch (err) {
    logVectorQueryFailure("relatedByVector", err);
    return [];
  }
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
 * Re-embed every wiki page and upsert it into the vector store. Used to backfill
 * after provisioning the index or switching embedding models.
 *
 * Upserts in place; it does NOT delete first, so embeddings for pages that no
 * longer exist are left behind — harmless, since every read intersects results
 * with the caller's readable/scoped slug set, so an orphan can't surface.
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
  const storage = getStorage();

  let embedded = 0;
  let skipped = 0;

  // Upsert every current page. This overwrites in place; embeddings for pages
  // that no longer exist are left untouched (no bulk-clear on a managed index),
  // but they're harmless — every read intersects results with the caller's
  // readable/scoped slug set, so an orphan vector can never surface.
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

      const meta: EmbeddingMeta = {
        model: modelName,
        contentHash: contentHash(page.content),
      };
      await withFileLock("vectors", () =>
        storage.upsertEmbedding(entry.slug, embedding, meta),
      );
      embedded++;
    } catch (err) {
      logger.warn("embeddings", `embed page "${entry.slug}" failed:`, err);
      skipped++;
    }

    onProgress?.(i + 1, total);
  }

  return { total, embedded, skipped, model: modelName };
}
