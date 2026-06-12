/**
 * Client-side filling of `yoyo-illustration` directives. The slides/HTML LLM
 * emits a placeholder figure with the scene in `data-scene`; here (in the parent
 * app) we POST each scene to `/api/illustrate`, get a self-contained `data:`
 * image back, and inject it — so the sandboxed HTML iframe receives a static
 * data-URI image (CSP-safe), exactly like the Mermaid path. Generation is paid +
 * cached server-side, so this only runs for directives that are actually present
 * and is bounded to a few per document.
 */

/** Max illustrations filled per document (cost/latency guard). */
export const MAX_ILLUSTRATIONS = 3;

/** Fetch a scene's illustration as a data URI (or null). Injectable for tests. */
export type IllustrateFetcher = (
  scene: string,
  lang: string,
) => Promise<string | null>;

const defaultFetcher: IllustrateFetcher = async (scene, lang) => {
  try {
    const res = await fetch("/api/illustrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene, lang }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { image?: string | null };
    return data.image ?? null;
  } catch {
    return null;
  }
};

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
 * - `"drop"` (default): remove the placeholder — right for client-side iframe
 *   rendering, where a leftover `data-scene` figure would just be blank.
 * - `"keep"`: leave the original directive untouched — right for **baking at
 *   save time**, so a transient generation failure doesn't permanently strip the
 *   directive (an on-demand viewer can still fill it later).
 */
export interface IllustrationRenderOptions {
  onMissing?: "drop" | "keep";
}

/** True when an HTML document contains a `yoyo-illustration` figure. Pure. */
export function htmlHasYoyoIllustration(html: string): boolean {
  return /<figure\b[^>]*\bclass=["'][^"']*\byoyo-illustration\b/i.test(html);
}

/**
 * Replace up to {@link MAX_ILLUSTRATIONS} `yoyo-illustration` figures in an HTML
 * string with the generated image (parallel). A figure whose scene can't be
 * generated is dropped (default) or left in place (`onMissing: "keep"`).
 */
export async function renderYoyoIllustrationsInHtml(
  html: string,
  fetcher: IllustrateFetcher = defaultFetcher,
  { onMissing = "drop" }: IllustrationRenderOptions = {},
): Promise<string> {
  const matches = [...html.matchAll(FIGURE_RE)].slice(0, MAX_ILLUSTRATIONS);
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

/** True when markdown (e.g. slides) contains a `yoyo-illustration` fence. Pure. */
export function markdownHasYoyoIllustration(md: string): boolean {
  return /```yoyo-illustration\b/.test(md);
}

/**
 * Replace up to {@link MAX_ILLUSTRATIONS} ` ```yoyo-illustration ` fences in a
 * markdown string (slides) with a baked `![scene](data:...)` image. A fence
 * whose scene can't be generated is dropped (default) or left in place
 * (`onMissing: "keep"`). Used to bake slide illustrations at save time.
 *
 * Labels bake in English — a slide fence carries no lang hint (unlike the HTML
 * `data-lang`). A *kept* fence still renders in our app (the slide/page
 * MarkdownRenderer routes it to `<YoyoIllustration>`), but shows as a literal
 * code block in a plain-markdown viewer; that's the accepted price of not
 * permanently dropping a directive on a transient failure.
 */
export async function renderYoyoIllustrationsInMarkdown(
  md: string,
  fetcher: IllustrateFetcher = defaultFetcher,
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
