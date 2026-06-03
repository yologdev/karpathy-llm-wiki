import { getWorkersAiBinding } from "./embeddings";
import { logger } from "./logger";

/**
 * Vision (image → text) extraction via the Workers AI binding.
 *
 * Mirrors the embeddings pattern (`getWorkersAiBinding().run(...)`). Used by the
 * image-ingest flow to turn an image into a factual description that becomes the
 * wiki page body. Fails SOFT: any problem (no binding, timeout, model error,
 * empty result) returns `null` so ingestion proceeds with an image-only page —
 * vision must never break the pipeline.
 */

/** Default model — overridable via the `VISION_MODEL` env var.
 *  llama-3.2-vision reads text/diagrams notably better than llava. */
const DEFAULT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const DEFAULT_PROMPT =
  "Describe this image in detail. Include any visible text, diagrams, charts, " +
  "people, objects, and the overall context. Be factual and concise.";

/** Hard ceiling so a slow/hung model run can't stall an ingest. */
const VISION_TIMEOUT_MS = 20_000;

function visionModel(): string {
  return process.env.VISION_MODEL || DEFAULT_VISION_MODEL;
}

/**
 * Describe an image from its raw bytes. Returns `{ text }` or `null` when vision
 * is unavailable / fails (caller then produces a minimal image-only page).
 */
export async function describeImage(
  image: ArrayBuffer | Uint8Array,
  opts?: { prompt?: string; maxTokens?: number },
): Promise<{ text: string } | null> {
  const ai = getWorkersAiBinding();
  if (!ai) return null; // off-Workers or AI binding unbound — degrade gracefully

  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
  const model = visionModel();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      ai.run(model, {
        image: [...bytes],
        prompt: opts?.prompt ?? DEFAULT_PROMPT,
        max_tokens: opts?.maxTokens ?? 512,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("vision timeout")), VISION_TIMEOUT_MS);
      }),
    ]);

    // Different models name the field differently (llama → response, llava →
    // description); read defensively.
    const text = (result.response ?? result.description ?? "").trim();
    if (!text) {
      logger.warn("vision", `Model ${model} returned an empty description.`);
      return null;
    }
    return { text };
  } catch (err) {
    logger.warn(
      "vision",
      `Image description failed (${model}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
