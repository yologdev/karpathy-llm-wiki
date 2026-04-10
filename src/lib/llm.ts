import { generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/**
 * Returns true if at least one supported LLM provider is configured.
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
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.OLLAMA_BASE_URL ||
    process.env.OLLAMA_MODEL
  );
}

/**
 * Build the appropriate Vercel AI SDK model instance based on available env
 * vars.  Priority (first match wins):
 *
 *   1. Anthropic (ANTHROPIC_API_KEY)
 *   2. OpenAI    (OPENAI_API_KEY)
 *   3. Google    (GOOGLE_GENERATIVE_AI_API_KEY)
 *   4. Ollama    (OLLAMA_BASE_URL or OLLAMA_MODEL)
 *
 * The model name can be overridden with the `LLM_MODEL` env var for whichever
 * provider wins.
 */
function getModel() {
  const modelOverride = process.env.LLM_MODEL;

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(modelOverride ?? "claude-sonnet-4-20250514");
  }

  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(modelOverride ?? "gpt-4o");
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google(modelOverride ?? "gemini-2.0-flash");
  }

  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    // Ollama's default local endpoint is http://localhost:11434/api.
    // The createOllama factory accepts a custom baseURL; omit it to use
    // the provider's built-in default.
    const ollama = process.env.OLLAMA_BASE_URL
      ? createOllama({ baseURL: process.env.OLLAMA_BASE_URL })
      : createOllama();
    return ollama(modelOverride ?? process.env.OLLAMA_MODEL ?? "llama3.2");
  }

  throw new Error(
    "No LLM API key found. Set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
      "GOOGLE_GENERATIVE_AI_API_KEY, or OLLAMA_BASE_URL / OLLAMA_MODEL in " +
      "your environment.",
  );
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
