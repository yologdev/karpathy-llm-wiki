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
import type { ProviderInfo } from "./types";

// Re-export ProviderInfo from types for backward compatibility
export type { ProviderInfo } from "./types";

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

  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
  });

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
