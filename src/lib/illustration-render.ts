/**
 * Server-side baking of `yoyo-illustration` directives. The slides/HTML LLM
 * emits a placeholder — a ` ```yoyo-illustration ` fence in markdown, or a
 * `<figure class="yoyo-illustration" data-scene="…">` in HTML — and here we
 * replace each with a real image reference. The `fetcher` generates each scene
 * once, stores it in R2, and returns a servable image reference — an
 * `/api/assets/…` URL for slides/markdown (`generateYoyoIllustration`), or a
 * self-contained `data:` URI for the HTML artifact
 * (`generateYoyoIllustrationDataUri`, whose sandboxed iframe can't load a
 * same-origin URL) — so the baked answer renders for every viewer (including
 * anonymous shares) with no per-view fetch. Generation is paid + cached
 * server-side, so only directives actually present are filled, bounded to a few
 * per document.
 */

/** Max illustrations filled per document (cost/latency guard). */
export const MAX_ILLUSTRATIONS = 3;

/** Generate a scene's illustration, returning a servable image reference — an
 *  `/api/assets/…` URL or a self-contained `data:` URI — or null. Injectable for
 *  tests; in production it's `generateYoyoIllustration` (slides) or
 *  `generateYoyoIllustrationDataUri` (HTML). */
export type IllustrateFetcher = (
  scene: string,
  lang: string,
) => Promise<string | null>;

const FIGURE_RE =
  /<figure\b[^>]*\bclass=["'][^"']*\byoyo-illustration\b[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi;

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * What to do with a directive whose scene can't be generated.
 * - `"drop"` (default): remove the placeholder — a clean answer with no
 *   illustration, no leaked directive in the rendered/saved output.
 * - `"keep"`: leave the original directive untouched.
 */
export interface IllustrationRenderOptions {
  onMissing?: "drop" | "keep";
}

/**
 * Replace up to {@link MAX_ILLUSTRATIONS} *unbaked* `yoyo-illustration` figures
 * (those carrying a `data-scene`) in an HTML string with the generated image
 * (parallel). An already-baked figure (an `<img>`, no `data-scene`) is left
 * untouched, so re-baking the same content is idempotent. A figure whose scene
 * can't be generated is dropped (default) or left in place (`onMissing: "keep"`).
 */
export async function renderYoyoIllustrationsInHtml(
  html: string,
  fetcher: IllustrateFetcher,
  { onMissing = "drop" }: IllustrationRenderOptions = {},
): Promise<string> {
  // Only act on figures that still carry a scene to generate. A baked figure
  // (no `data-scene`, just an `<img>`) must pass through untouched — otherwise a
  // second bake (e.g. save-time after query-time) would match it, find no scene,
  // and drop the already-generated image.
  const matches = [...html.matchAll(FIGURE_RE)]
    .filter((m) => attr(m[0], "data-scene"))
    .slice(0, MAX_ILLUSTRATIONS);
  if (matches.length === 0) return html;

  const filled = await Promise.all(
    matches.map(async (m) => {
      const tag = m[0];
      const scene = attr(tag, "data-scene") ?? "";
      const lang = attr(tag, "data-lang") ?? "English";
      const image = scene ? await fetcher(scene, lang) : null;
      return { match: tag, image, alt: scene };
    }),
  );

  let out = html;
  for (const { match, image, alt } of filled) {
    const replacement = image
      ? `<figure class="yoyo-illustration"><img src="${image}" alt="${escapeHtml(
          alt,
        )}" style="max-width:100%;height:auto" /></figure>`
      : onMissing === "keep"
        ? match // preserve the directive — a viewer can still fill it on demand
        : ""; // generation failed — drop the placeholder
    // Function replacement: a data-URI / alt text may contain `$&`/`$1`.
    out = out.replace(match, () => replacement);
  }
  return out;
}

/** A ` ```yoyo-illustration ` fenced block; the body is the scene. */
const MD_FENCE_RE = /```yoyo-illustration\b[^\n]*\n([\s\S]*?)\n```/g;

/**
 * Replace up to {@link MAX_ILLUSTRATIONS} ` ```yoyo-illustration ` fences in a
 * markdown string (slides) with a baked `![scene](/api/assets/…)` image. A fence
 * whose scene can't be generated is dropped (the default `onMissing`). Labels
 * bake in English — a slide fence carries no lang hint (unlike the HTML
 * `data-lang`).
 */
export async function renderYoyoIllustrationsInMarkdown(
  md: string,
  fetcher: IllustrateFetcher,
  { onMissing = "drop" }: IllustrationRenderOptions = {},
): Promise<string> {
  const matches = [...md.matchAll(MD_FENCE_RE)].slice(0, MAX_ILLUSTRATIONS);
  if (matches.length === 0) return md;

  const filled = await Promise.all(
    matches.map(async (m) => {
      const scene = m[1].trim();
      const image = scene ? await fetcher(scene, "English") : null;
      return { match: m[0], image, alt: scene };
    }),
  );

  let out = md;
  for (const { match, image, alt } of filled) {
    // Markdown alt can't span lines or hold `]` — collapse to a safe one-liner.
    const safeAlt = alt.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();
    const replacement = image
      ? `![${safeAlt}](${image})`
      : onMissing === "keep"
        ? match
        : "";
    // Function replacement: a data-URI may contain `$&`/`$1`.
    out = out.replace(match, () => replacement);
  }
  return out;
}
