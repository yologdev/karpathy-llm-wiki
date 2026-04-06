import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";

/**
 * Call the Anthropic Claude API and return the assistant's text response.
 *
 * Requires `ANTHROPIC_API_KEY` to be set in the environment.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text from content blocks
  const textBlocks = response.content.filter(
    (block) => block.type === "text",
  );
  if (textBlocks.length === 0) {
    throw new Error("LLM response contained no text blocks");
  }
  return textBlocks.map((b) => b.text).join("");
}
