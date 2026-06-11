import type { MermaidConfig } from "mermaid";
import { logger } from "./logger";

/**
 * Client-only Mermaid rendering. Mermaid is browser-only (it needs the DOM) and
 * ~3MB, so it is **dynamic-imported** and invoked only from client components,
 * via two paths:
 *   - HTML answers: `renderMermaidInHtml` swaps `<pre class="mermaid">` blocks for
 *     static SVG BEFORE the document reaches the sandboxed iframe — so the iframe
 *     needs no library injection and no CSP exception.
 *   - markdown / slide answers: the `<Mermaid>` component renders `renderMermaid`
 *     output into the page.
 * The heavy library never ships in the server bundle or a normal page — only as a
 * lazy chunk fetched when an answer actually contains a diagram.
 *
 * `securityLevel: "strict"` makes Mermaid sanitize labels (no scripts / click
 * handlers), so a model-authored graph can't smuggle markup into the page.
 */
const MERMAID_THEME: MermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  // Concrete hex (the SVG is standalone — CSS vars aren't available inside it),
  // matching the yopedia/yoyo palette (accent #4d6bfe on warm paper).
  themeVariables: {
    primaryColor: "#e7ebff",
    primaryBorderColor: "#4d6bfe",
    primaryTextColor: "#1b1a16",
    lineColor: "#423f38",
    secondaryColor: "#f4f1e9",
    tertiaryColor: "#fbfaf6",
    fontSize: "15px",
  },
};

let loader: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!loader) {
    loader = import("mermaid").then((m) => {
      m.default.initialize(MERMAID_THEME);
      return m.default;
    });
  }
  return loader;
}

let seq = 0;

/** Render one Mermaid graph definition to an SVG string. Rejects on a syntax error. */
export async function renderMermaid(code: string): Promise<string> {
  const mermaid = await loadMermaid();
  const id = `mmd-${seq++}-${Math.floor(performance.now())}`;
  const { svg } = await mermaid.render(id, code.trim());
  return svg;
}

/** True when an HTML document contains a `<pre class="mermaid">` block. Pure. */
export function htmlHasMermaid(html: string): boolean {
  return /<pre[^>]*\bclass=["'][^"']*\bmermaid\b/i.test(html);
}

const MERMAID_BLOCK_RE =
  /<pre[^>]*\bclass=["'](?:[^"']*\s)?mermaid(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/pre>/gi;

// Decode the handful of entities a model may emit inside a <pre> so the Mermaid
// parser sees the raw graph definition. `&amp;` LAST to avoid double-decoding.
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Replace every `<pre class="mermaid">…</pre>` block in an HTML string with its
 * rendered SVG. A block that fails to render is left as-is (shows the source).
 * Client-only by default (calls {@link renderMermaid}); `render` is injectable so
 * the pure extract/decode/replace logic is testable without the browser library.
 */
export async function renderMermaidInHtml(
  html: string,
  render: (code: string) => Promise<string> = renderMermaid,
): Promise<string> {
  const blocks: { match: string; code: string }[] = [];
  for (const m of html.matchAll(MERMAID_BLOCK_RE)) {
    blocks.push({ match: m[0], code: decodeEntities(m[1]) });
  }
  if (blocks.length === 0) return html;

  let out = html;
  for (const { match, code } of blocks) {
    try {
      const svg = await render(code);
      // Replacement via a FUNCTION, not a string: SVG carries model-authored
      // labels that may contain `$&` / `$$` / `$1`, which String.replace would
      // otherwise interpret as special patterns and corrupt the output.
      out = out.replace(
        match,
        () =>
          `<div class="mermaid-diagram" style="text-align:center;margin:1.5rem 0">${svg}</div>`,
      );
    } catch (err) {
      // Leave the original <pre> block (reader still sees the definition). Log so
      // a recurring bad-diagram pattern or a chunk-load failure is debuggable —
      // matching the Chart.js fail-soft-but-log convention.
      logger.warn("html", "mermaid block render failed; leaving source", err);
    }
  }
  return out;
}
