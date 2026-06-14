import { getStorage } from "./storage";
import { rawRelPath } from "./wiki";
import { isEnoent } from "./errors";
import { logger } from "./logger";
import { YOYO_REFERENCE_PNG_BASE64 } from "./vendor/yoyo-reference.generated";
import {
  renderYoyoIllustrationsInHtml,
  renderYoyoIllustrationsInMarkdown,
} from "./illustration-render";

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

/** R2 asset ref a generated scene is stored + referenced under (markdown/URL
 *  facing); `rawRelPath` maps it to the underlying storage key. */
function assetRefFor(key: string): string {
  return `assets/illustrations/${key}.jpg`;
}

/** Public, no-auth URL the answer embeds — served by `/api/assets/[...path]`
 *  (immutable cache). Derived from the asset ref so the stored path and the
 *  embedded URL can't drift; mirrors `resolveImageSrc`'s `assets/…`→`/api/assets/…`. */
function assetUrlFor(key: string): string {
  return `/api/assets/${assetRefFor(key).slice("assets/".length)}`;
}

/** Decode a `data:image/…;base64,<b64>` URI to its raw bytes for asset storage. */
function bytesFromDataUri(dataUri: string): ArrayBuffer {
  const comma = dataUri.indexOf(",");
  const b64 = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Call Grok's image-edits endpoint with the brand reference → a jpeg data URI.
 *
 * xAI's `/v1/images/edits` is **JSON, not multipart** — the OpenAI-SDK
 * `images.edit()` shape (a `FormData` file upload) is rejected with a 4xx. The
 * reference image is passed inline as a base64 data URI in an `image_url`
 * object. See https://github.com/vercel/ai/issues/12368. */
async function callGrok(prompt: string, key: string): Promise<string | null> {
  const res = await fetch(XAI_EDITS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: XAI_IMAGE_MODEL,
      prompt,
      image: {
        type: "image_url",
        url: `data:image/png;base64,${YOYO_REFERENCE_PNG_BASE64}`,
      },
      response_format: "b64_json",
    }),
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

/** Encode raw image bytes as a `data:image/jpeg` URI — for the self-contained
 *  HTML-iframe path (see {@link generateYoyoIllustrationDataUri}). */
function dataUriFromBytes(bytes: ArrayBuffer): string {
  const buf = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

/**
 * Ensure a scene's illustration exists in R2, generating + storing it on a miss.
 * The scene-hash is the cache: a repeat scene is a metadata `stat` (no Grok
 * call, no spend). Returns the cache key + storage key, or `null` when there's
 * no `XAI_API_KEY` or generation/storage fails. Shared by both entry points
 * below (URL for slides, data URI for HTML).
 */
async function ensureIllustrationAsset(
  scene: string,
  lang: string,
): Promise<{ key: string; storageKey: string } | null> {
  const trimmed = scene.trim();
  if (!trimmed) return null;

  const key = cacheKeyFor(trimmed, lang);
  const storageKey = rawRelPath(assetRefFor(key));

  // Cache hit: the asset already exists → no Grok call. `stat` fetches only
  // metadata (cheaper than reading bytes). A genuine miss falls through to
  // generate; a real storage error logs but still falls through (degrade to a
  // regen attempt, never hard-fail).
  try {
    await getStorage().stat(storageKey);
    return { key, storageKey };
  } catch (err) {
    if (!isEnoent(err)) {
      logger.warn("illustration", "illustration cache stat failed", err);
    }
  }

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

  // Store the bytes as a reusable R2 asset. A write failure returns `null` (drop
  // the illustration) rather than referencing an asset that would 404 — the next
  // request for this scene retries the generation.
  try {
    await getStorage().writeAsset(storageKey, bytesFromDataUri(dataUri));
  } catch (err) {
    logger.warn("illustration", "illustration asset write failed", err);
    return null;
  }
  return { key, storageKey };
}

/**
 * Generate (or return a cached) yoyo illustration and return its **servable
 * `/api/assets/…` URL** — for slides/markdown, rendered in the main document
 * where a same-origin URL loads normally. Returns `null` on failure (the caller
 * renders without the illustration). Called server-side at answer generation
 * time (`query()`), so every viewer — including anonymous shares — loads the
 * finished image by URL with no per-view fetch.
 */
export async function generateYoyoIllustration(
  scene: string,
  lang = "English",
): Promise<string | null> {
  const asset = await ensureIllustrationAsset(scene, lang);
  return asset ? assetUrlFor(asset.key) : null;
}

/**
 * Same generation, returned as a self-contained `data:` URI — for the **HTML
 * artifact**, which renders in a sandboxed iframe with an opaque origin. Its CSP
 * (`img-src data:`) can't load a same-origin `/api/assets` URL (`'self'` never
 * matches an opaque origin), so the image is inlined. The bytes still live in R2
 * (shared scene-hash cache → no per-view Grok); this reads them back. Returns
 * `null` on failure.
 */
export async function generateYoyoIllustrationDataUri(
  scene: string,
  lang = "English",
): Promise<string | null> {
  const asset = await ensureIllustrationAsset(scene, lang);
  if (!asset) return null;
  try {
    return dataUriFromBytes(await getStorage().readAsset(asset.storageKey));
  } catch (err) {
    logger.warn("illustration", "illustration asset read failed", err);
    return null;
  }
}

/**
 * Bake every `yoyo-illustration` directive in an answer into a real image
 * reference — generating each scene server-side (cache-first), storing it in R2.
 * Slides embed the `/api/assets/…` URL; the HTML artifact embeds a self-contained
 * `data:` URI (its sandboxed iframe can't load a same-origin URL). Called at
 * answer generation time (`query()`) and, idempotently, at save time. A directive
 * whose image can't be generated is **dropped** (the default `onMissing`): with
 * no per-view fallback to retry it, a clean answer with no illustration beats a
 * broken placeholder baked into a saved page. Returns the content unchanged when
 * it carries no directives. Mermaid stays client-rendered (it's free).
 */
export async function bakeYoyoIllustrations(
  content: string,
  isHtml: boolean,
): Promise<string> {
  return isHtml
    ? // HTML → a self-contained `data:` URI: the sandboxed iframe's opaque
      // origin can't load a same-origin `/api/assets` URL, so do NOT swap in the
      // URL fetcher (`generateYoyoIllustration`) here.
      renderYoyoIllustrationsInHtml(content, (scene, lang) =>
        generateYoyoIllustrationDataUri(scene, lang),
      )
    : renderYoyoIllustrationsInMarkdown(content, (scene, lang) =>
        generateYoyoIllustration(scene, lang),
      );
}

export const _internal = {
  buildIllustrationPrompt,
  cacheKeyFor,
  callGrok,
  assetRefFor,
  assetUrlFor,
  bytesFromDataUri,
  dataUriFromBytes,
};
