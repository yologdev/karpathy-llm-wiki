import { getStorage } from "./storage";
import { isEnoent } from "./errors";
import { logger } from "./logger";
import { YOYO_REFERENCE_PNG_BASE64 } from "./vendor/yoyo-reference.generated";

/**
 * yoyo brand illustrations via the xAI Grok image API. The static brand DNA
 * below is ported from the `yoyo-illustrations` skill (style-dna / yoyo-ip /
 * prompt-template). The reference image is sent to the **edits** endpoint so the
 * octopus stays on-model across generations.
 *
 * Fail-soft by contract: every entry point returns `null` (never throws) when
 * there's no key or the API hiccups — an illustration is an enhancement, so the
 * slides/HTML answer must always render with or without it.
 */

const XAI_EDITS_ENDPOINT = "https://api.x.ai/v1/images/edits";
const XAI_IMAGE_MODEL = "grok-imagine-image-quality";

/** The fixed brand frame; only the scene + language vary per call. */
function buildIllustrationPrompt(scene: string, lang: string): string {
  return [
    `Generate one standalone 16:9 horizontal hand-drawn article illustration.`,
    `Visual DNA: pure white background; minimalist black hand-drawn line art (thin, slightly wobbly pen lines) for the scene and props; lots of empty white space; a few short handwritten annotations in ${lang}. Clean, quietly weird, product-sketch feeling. No gradients, no shadows (except yoyo's soft ground shadow), no paper texture, no commercial vector style, no PPT/infographic look, no flowchart, no cute mascot poster, no children's illustration, no realistic UI.`,
    `Recurring character (required): yoyo — a soft lavender-purple octopus (#B3A7F0) with a bold slightly-uneven black outline, a rounded-square head, two simple black dot eyes, a small calm smile, and eight tentacles with pale-pink undersides. yoyo is the ONLY filled-color subject; everything else is black line art on white. yoyo must PERFORM the core action of the scene with its tentacles, not stand beside it. Keep yoyo gentle, earnest, deadpan, a little shy.`,
    `Color: purple body + pale-pink tentacle undersides for yoyo only; black for all other line art; orange for the main flow/path/arrows; red only for key warnings/results; blue only for secondary notes. Nothing except yoyo is purple or pink.`,
    `The scene to draw: ${scene}`,
    `Constraints: explain only ONE idea; subject ~40-60% of canvas; keep at least 35% blank white space; at most 5-8 short handwritten labels, all in ${lang}; no title in the top-left corner; invent a fresh visual metaphor for this scene; clear but not instructional, interesting but not childish, strange but clean.`,
  ].join("\n\n");
}

/** Stable 64-bit cache key (forward + reverse FNV-1a) — wide enough that a wrong
 *  cached illustration from a collision is implausible at any real volume. */
function cacheKeyFor(scene: string, lang: string): string {
  const s = `v1|${XAI_IMAGE_MODEL}|${lang}|${scene}`;
  let a = 0x811c9dc5;
  let b = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ s.charCodeAt(s.length - 1 - i), 0x01000193);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}

function relPathFor(key: string): string {
  return `illustrations/${key}.txt`;
}

async function readCache(key: string): Promise<string | null> {
  try {
    return await getStorage().readFile(relPathFor(key));
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Call Grok's image-edits endpoint with the brand reference → a jpeg data URI. */
async function callGrok(prompt: string, key: string): Promise<string | null> {
  const form = new FormData();
  form.append(
    "image",
    // Cast: the lib's BlobPart doesn't accept the generic Uint8Array<ArrayBufferLike>.
    new Blob([base64ToBytes(YOYO_REFERENCE_PNG_BASE64) as BlobPart], {
      type: "image/png",
    }),
    "yoyo-reference.png",
  );
  form.append("prompt", prompt);
  form.append("model", XAI_IMAGE_MODEL);
  form.append("n", "1");
  form.append("response_format", "b64_json");

  const res = await fetch(XAI_EDITS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const snip = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
    // 401/403 = bad/expired key (config defect) → loud; transient stays warn.
    const level = res.status === 401 || res.status === 403 ? "error" : "warn";
    logger[level](
      "illustration",
      `Grok image edits failed (HTTP ${res.status}): ${snip}`,
    );
    return null;
  }
  const data = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = data.data?.[0];
  if (first?.b64_json) return `data:image/jpeg;base64,${first.b64_json}`;
  if (first?.url) {
    // Some responses return a URL instead of inline base64 — fetch + inline it
    // so the artifact stays self-contained / CSP-safe.
    const img = await fetch(first.url);
    if (!img.ok) return null;
    const buf = new Uint8Array(await img.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:image/jpeg;base64,${btoa(bin)}`;
  }
  logger.warn("illustration", "Grok image edits returned no image");
  return null;
}

/**
 * Generate (or return a cached) yoyo illustration for a scene, as a jpeg data
 * URI. Returns `null` when there's no `XAI_API_KEY` or generation fails — the
 * caller renders the answer without the illustration.
 */
export async function generateYoyoIllustration(
  scene: string,
  lang = "English",
): Promise<string | null> {
  const trimmed = scene.trim();
  if (!trimmed) return null;

  const key = cacheKeyFor(trimmed, lang);
  const cached = await readCache(key).catch((err) => {
    logger.warn("illustration", "illustration cache read failed", err);
    return null;
  });
  if (cached) return cached;

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;

  let dataUri: string | null = null;
  try {
    dataUri = await callGrok(buildIllustrationPrompt(trimmed, lang), apiKey);
  } catch (err) {
    logger.warn("illustration", "Grok image generation error", err);
    return null;
  }
  if (!dataUri) return null;

  await getStorage()
    .writeFile(relPathFor(key), dataUri)
    .catch((err) => logger.warn("illustration", "illustration cache write failed", err));
  return dataUri;
}

export const _internal = { buildIllustrationPrompt, cacheKeyFor };
