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

/** True when an HTML document contains a `yoyo-illustration` figure. Pure. */
export function htmlHasYoyoIllustration(html: string): boolean {
  return /<figure\b[^>]*\bclass=["'][^"']*\byoyo-illustration\b/i.test(html);
}

/**
 * Replace up to {@link MAX_ILLUSTRATIONS} `yoyo-illustration` figures in an HTML
 * string with the generated image (parallel). A figure whose scene can't be
 * generated is dropped (no broken placeholder).
 */
export async function renderYoyoIllustrationsInHtml(
  html: string,
  fetcher: IllustrateFetcher = defaultFetcher,
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
      : ""; // generation failed — drop the placeholder
    // Function replacement: a data-URI / alt text may contain `$&`/`$1`.
    out = out.replace(match, () => replacement);
  }
  return out;
}
