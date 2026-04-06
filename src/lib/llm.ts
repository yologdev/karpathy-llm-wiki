import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/**
 * Returns true if at least one supported LLM provider API key is configured.
 */
export function hasLLMKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Build the appropriate Vercel AI SDK model instance based on available env
 * vars.  Priority: Anthropic → OpenAI.
 *
 * The model name can be overridden with the `LLM_MODEL` env var.
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

  throw new Error(
    "No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call the configured LLM provider and return the assistant's text response.
 *
 * Requires at least one supported API key (ANTHROPIC_API_KEY, OPENAI_API_KEY)
 * to be set in the environment.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const model = getModel();

  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 4096,
  });

  if (!text) {
    throw new Error("LLM response contained no text");
  }

  return text;
}
