import { generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import {
  getEffectiveProvider,
  getResolvedCredentials,
  loadConfigSync,
} from "./config";
import {
  LLM_MAX_RETRIES,
  LLM_RETRY_BASE_MS,
  LLM_RETRY_MAX_MS,
} from "./constants";
import type { ProviderInfo } from "./types";

// Re-export ProviderInfo from types for backward compatibility
export type { ProviderInfo } from "./types";

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

/** HTTP status codes that indicate a transient / retryable failure. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Substrings in error messages that indicate a network-level transient error. */
const RETRYABLE_MESSAGES = [
  "econnreset",
  "etimedout",
  "fetch failed",
  "socket hang up",
  "network error",
  "enotfound",
  "econnrefused",
];

/**
 * Determine whether an error is transient and therefore safe to retry.
 *
 * Retryable: HTTP 429 / 5xx, network errors (ECONNRESET, ETIMEDOUT, etc.)
 * Not retryable: 400, 401, 403, missing API key, validation errors.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Explicitly non-retryable patterns — bail early
  if (message.includes("no llm api key")) return false;

  // Check for HTTP status codes embedded in the error
  // Many AI SDK errors include the status code in the message or as a property
  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    // 4xx codes other than 429 are NOT retryable (auth, validation, not found)
    if (status >= 400 && status < 500 && status !== 429) return false;
    if (RETRYABLE_STATUS_CODES.has(status)) return true;
  }

  // Check for a `status` property (common in fetch / AI SDK errors)
  const errWithStatus = error as Error & { status?: number };
  if (typeof errWithStatus.status === "number") {
    const s = errWithStatus.status;
    if (s >= 400 && s < 500 && s !== 429) return false;
    if (RETRYABLE_STATUS_CODES.has(s)) return true;
  }

  // Check for network-level error messages
  if (RETRYABLE_MESSAGES.some((msg) => message.includes(msg))) return true;

  return false;
}

/**
 * Add ±20 % random jitter to a delay value so retries from multiple callers
 * don't thundering-herd the provider at the same instant.
 */
function addJitter(ms: number): number {
  const factor = 0.8 + Math.random() * 0.4; // 0.8 – 1.2
  return Math.round(ms * factor);
}

/**
 * Retry an async function with exponential backoff.
 *
 * Only retries on errors deemed transient by {@link isRetryableError}.
 * Non-retryable errors are thrown immediately.
 *
 * @param fn          — The async operation to attempt.
 * @param maxRetries  — Maximum number of *retry* attempts (so total attempts = maxRetries + 1).
 * @param baseMs      — Base delay before the first retry (doubles each attempt).
 * @param maxMs       — Cap on the computed delay.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = LLM_MAX_RETRIES,
  baseMs: number = LLM_RETRY_BASE_MS,
  maxMs: number = LLM_RETRY_MAX_MS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // If the error isn't transient, don't bother retrying
      if (!isRetryableError(err)) throw err;

      // If we've used all retry attempts, throw
      if (attempt === maxRetries) break;

      const rawDelay = Math.min(baseMs * 2 ** attempt, maxMs);
      const delay = addJitter(rawDelay);

      console.warn(
        `[llm] Retryable error on attempt ${attempt + 1}/${maxRetries + 1}, ` +
          `retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/**
 * Returns true if at least one supported LLM provider is configured.
 *
 * Checks both environment variables and the config file
 * (`.llm-wiki-config.json`).  Env vars take priority but the config file
 * acts as a fallback so users can configure via the UI.
 *
 * Supported providers and their env vars:
 *   - Anthropic: ANTHROPIC_API_KEY
 *   - OpenAI:    OPENAI_API_KEY
 *   - Google:    GOOGLE_GENERATIVE_AI_API_KEY
 *   - Ollama:    OLLAMA_BASE_URL or OLLAMA_MODEL (Ollama is typically keyless;
 *                presence of either env var signals intent to use a local
 *                Ollama server)
 *
 * Additional env vars (used by src/lib/embeddings.ts, not this module):
 *   - EMBEDDING_MODEL: override the default embedding model name for the
 *     active provider. Defaults are:
 *       OpenAI → text-embedding-3-small
 *       Google → gemini-embedding-001
 *       Ollama → nomic-embed-text
 *     Anthropic does not support embeddings.
 *     See `src/lib/embeddings.ts` for the full embedding API.
 */
export function hasLLMKey(): boolean {
  // Fast path: check env vars first
  if (
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.OLLAMA_BASE_URL ||
    process.env.OLLAMA_MODEL
  ) {
    return true;
  }
  // Fallback: check config file (cached sync read)
  const cfg = loadConfigSync();
  return !!(cfg.provider || cfg.apiKey);
}

// ---------------------------------------------------------------------------
// Provider info (metadata only — no API calls)
// ---------------------------------------------------------------------------

/**
 * Return metadata about the currently configured LLM provider without
 * constructing a model instance or making any network calls.
 *
 * Merges env vars and config file settings (env wins).
 */
export function getProviderInfo(): ProviderInfo {
  return getEffectiveProvider();
}

// ---------------------------------------------------------------------------
// Model construction (internal)
// ---------------------------------------------------------------------------

/**
 * Build the appropriate Vercel AI SDK model instance based on resolved
 * credentials.  Resolution merges env vars and the config file, with env
 * vars taking priority.
 *
 * The model name can be overridden with the `LLM_MODEL` env var, or via
 * the config file's `model` field.
 */
function getModel() {
  const creds = getResolvedCredentials();

  if (!creds.provider) {
    throw new Error(
      "No LLM API key found. Set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
        "GOOGLE_GENERATIVE_AI_API_KEY, or OLLAMA_BASE_URL / OLLAMA_MODEL in " +
        "your environment, or configure a provider in Settings.",
    );
  }

  const model = creds.model!;

  switch (creds.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: creds.apiKey! });
      return anthropic(model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: creds.apiKey! });
      return openai(model);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: creds.apiKey! });
      return google(model);
    }
    case "ollama": {
      const ollama = creds.ollamaBaseUrl
        ? createOllama({ baseURL: creds.ollamaBaseUrl })
        : createOllama();
      return ollama(model);
    }
    default:
      throw new Error(`Unsupported provider: ${creds.provider}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call the configured LLM provider and return the assistant's text response.
 *
 * Automatically retries on transient errors (429, 5xx, network issues) with
 * exponential backoff. See {@link retryWithBackoff} for details.
 *
 * Requires at least one supported provider env var to be set:
 * ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or
 * OLLAMA_BASE_URL / OLLAMA_MODEL.
 *
 * @param options.maxOutputTokens — optional cap on output tokens (default 4096).
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options?: { maxOutputTokens?: number },
): Promise<string> {
  const model = getModel();

  const { text } = await retryWithBackoff(() =>
    generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: options?.maxOutputTokens ?? 4096,
    }),
  );

  if (!text) {
    throw new Error("LLM response contained no text");
  }

  return text;
}

/**
 * Call the configured LLM provider and return a streaming result.
 *
 * Returns a `StreamTextResult` from the Vercel AI SDK. Use
 * `.toTextStreamResponse()` to convert it into a standard `Response` for
 * HTTP streaming, or await `.text` to collect the full response.
 *
 * Requires at least one supported provider env var to be set (same as
 * {@link callLLM}).
 *
 * **Why no retry wrapper:** Unlike `generateText()` which is fully async and
 * throws on connection failure, `streamText()` returns synchronously — the
 * actual network call happens lazily when the stream is consumed. Wrapping
 * `streamText()` in `retryWithBackoff` would not catch transient connection
 * errors (429, 503, ECONNRESET, etc.) because `streamText()` itself never
 * throws; those errors only surface when reading from the returned stream.
 * Mid-stream retry would require buffering emitted tokens and reconnecting
 * the client, which is significantly more complex. The Vercel AI SDK's own
 * `maxRetries` setting (passed through `CallSettings`) handles provider-level
 * retries internally for the underlying `doStream()` call.
 *
 * @param options.maxOutputTokens — optional cap on output tokens (default 4096).
 */
export function callLLMStream(
  systemPrompt: string,
  userMessage: string,
  options?: { maxOutputTokens?: number },
) {
  const model = getModel();

  return streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
  });
}
