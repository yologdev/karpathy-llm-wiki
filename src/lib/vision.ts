import { getWorkersAiBinding } from "./embeddings";
import { hasLLMKey, callVisionLLM } from "./llm";
import { logger } from "./logger";

/**
 * Vision (image → text) extraction.
 *
 * Prefers the configured LLM provider's multimodal capability (e.g. DeepSeek V4,
 * which is Chinese-native and far better at CJK text than the free Workers AI
 * vision models) — reusing the existing API key, no extra model/license. Falls
 * back to the Workers AI binding (llava, no license required) when no LLM key is
 * present (e.g. local dev). Fails SOFT: any problem returns `null` so an image
 * still ingests as an image-only page — vision must never break the pipeline.
 */

/** Workers AI fallback model — overridable via `VISION_MODEL`. llava needs no
 *  license agreement (unlike llama-3.2-vision). */
const DEFAULT_WAI_VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

const DEFAULT_PROMPT =
  "Read this image carefully.\n" +
  "1. First, TRANSCRIBE every piece of visible text exactly as written, in its " +
  "ORIGINAL language — do not translate or paraphrase. Preserve line breaks and " +
  "any formulas/equations.\n" +
  "2. Then add a short factual description of the visuals (diagrams, charts, " +
  "objects, layout) and the overall purpose.\n" +
  "If there is no text, just describe the image.";

/** Hard ceiling so a slow/hung Workers AI run can't stall an ingest. */
const WAI_TIMEOUT_MS = 20_000;

/**
 * Describe an image from its raw bytes. Returns `{ text }` or `null` when no
 * vision backend is available / it fails.
 */
export async function describeImage(
  image: ArrayBuffer | Uint8Array,
  opts?: { prompt?: string; maxTokens?: number; mediaType?: string },
): Promise<{ text: string } | null> {
  const prompt = opts?.prompt ?? DEFAULT_PROMPT;
  const maxTokens = opts?.maxTokens ?? 512;

  // 1. Preferred: the configured LLM's multimodal vision (DeepSeek etc.).
  if (hasLLMKey()) {
    try {
      const text = (
        await callVisionLLM(prompt, image, {
          maxOutputTokens: maxTokens,
          mediaType: opts?.mediaType,
        })
      ).trim();
      if (text) return { text };
      logger.warn("vision", "Vision LLM returned an empty description.");
    } catch (err) {
      logger.warn(
        "vision",
        `Vision LLM failed (${err instanceof Error ? err.message : String(err)}) — ` +
          "falling back to Workers AI.",
      );
    }
  }

  // 2. Fallback: the Workers AI binding (llava).
  const ai = getWorkersAiBinding();
  if (!ai) return null;
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
  const model = process.env.VISION_MODEL || DEFAULT_WAI_VISION_MODEL;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      ai.run(model, { image: [...bytes], prompt, max_tokens: maxTokens }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("vision timeout")), WAI_TIMEOUT_MS);
      }),
    ]);
    // Field name varies by model (llava → description, llama → response).
    const text = (result.response ?? result.description ?? "").trim();
    if (!text) {
      logger.warn("vision", `Workers AI ${model} returned an empty description.`);
      return null;
    }
    return { text };
  } catch (err) {
    logger.warn(
      "vision",
      `Workers AI image description failed (${model}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
