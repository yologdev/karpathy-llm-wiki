// ---------------------------------------------------------------------------
// Shared tuning constants
// ---------------------------------------------------------------------------
// Centralised home for every "magic number" used across the app.  Keeping them
// in one file makes it easy to tune behaviour without hunting through modules.
// ---------------------------------------------------------------------------

// ---- Ingest / Fetch -------------------------------------------------------

/** Maximum HTTP response body size in bytes (5 MB). */
export const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/** Maximum extracted text content length passed downstream (100 K chars). */
export const MAX_CONTENT_LENGTH = 100_000;

/** URL fetch timeout in milliseconds (15 seconds). */
export const FETCH_TIMEOUT_MS = 15_000;

/**
 * Maximum characters sent to the LLM in a single chunk during ingest.
 *
 * 12,000 chars ≈ 3,000 tokens — conservative enough for all providers and
 * leaves ample room for the system prompt and output tokens within even the
 * smallest context windows (8K tokens).
 */
export const MAX_LLM_INPUT_CHARS = 12_000;

// ---- Batch ingest ---------------------------------------------------------

/** Maximum number of URLs accepted in a single batch-ingest request. */
export const MAX_BATCH_URLS = 20;

// ---- Query / Retrieval ----------------------------------------------------

/** Maximum number of wiki pages to include in query context. */
export const MAX_CONTEXT_PAGES = 10;

/**
 * BM25 term-frequency saturation parameter.
 *
 * Controls how quickly term frequency saturates. Higher values give more
 * weight to repeated terms. Standard default is 1.2–2.0.
 */
export const BM25_K1 = 1.5;

/**
 * BM25 length-normalisation parameter.
 *
 * Controls how much document length affects the score. 0 = no length
 * normalisation, 1 = fully relative to average document length.
 * Standard default is 0.75.
 */
export const BM25_B = 0.75;

/**
 * Reciprocal Rank Fusion (RRF) constant.
 *
 * Dampens the influence of high-rank positions when fusing BM25 and vector
 * search results. Standard value is 60.
 */
export const RRF_K = 60;

// ---- LLM Retry ------------------------------------------------------------

/** Maximum number of retry attempts for transient LLM errors. */
export const LLM_MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff (1s → 2s → 4s). */
export const LLM_RETRY_BASE_MS = 1_000;

/** Maximum backoff delay cap in ms. */
export const LLM_RETRY_MAX_MS = 10_000;

// ---- Embeddings -----------------------------------------------------------

/**
 * Maximum characters sent to the embedding model per text.
 *
 * 24,000 chars ≈ ~6,000 tokens — safely under the 8,191-token limit of
 * OpenAI's text-embedding-3-small and comparable limits of other providers.
 * Text exceeding this length is truncated before being sent to the model.
 */
export const MAX_EMBED_CHARS = 24_000;
