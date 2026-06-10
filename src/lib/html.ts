/**
 * Helpers for the sandboxed "html" answer format.
 *
 * Pure and runtime-agnostic (no DOM) so they work on the Cloudflare Workers
 * runtime and in tests. The security model is ISOLATION, not sanitization:
 * model-authored HTML is rendered in an `<iframe srcDoc>` with
 * `sandbox="allow-scripts"` and NO `allow-same-origin`, so scripts run in a
 * unique opaque origin that can't read the app's cookies/DOM/storage or make
 * credentialed/same-origin requests. The injected CSP additionally blocks all
 * network egress and external resources.
 *
 * Charts use Chart.js, inlined into the document at render time (see
 * `sandboxHead`) rather than loaded from a CDN — so the isolation guarantees
 * above hold unchanged (no network, fully self-contained / offline / shareable).
 * The (~200KB) library source is passed IN to `composeSrcDoc` so callers can
 * lazy-load it (see `HtmlPreview`) and keep it out of this module's bundle.
 */

/**
 * The iframe `sandbox` attribute. Scripts run, but the absence of
 * `allow-same-origin` gives the frame a unique opaque origin — it CANNOT touch
 * the parent app's cookies, DOM, storage, or session.
 *
 * SECURITY: never add `allow-same-origin` here. `allow-scripts` +
 * `allow-same-origin` together let the framed document remove its own sandbox
 * (`frameElement.sandbox`) and escape isolation. Frame height is solved by
 * postMessage (below), so same-origin access is never needed.
 */
export const HTML_SANDBOX = "allow-scripts";

/**
 * Hard cap (px) on a sandboxed frame's reported height — bounds a runaway/hostile
 * grow while staying generous enough (~30 screen-heights at 800px) for a long,
 * self-contained artifact to render without an inner scrollbar. Past the cap,
 * HtmlPreview re-enables the iframe's own scrollbar so content isn't clipped.
 */
export const HTML_MAX_HEIGHT = 24000;

/** Message shape posted by the sandboxed frame to report its height. */
export const HTML_HEIGHT_MESSAGE_KEY = "__wikiHtmlHeight";

/**
 * Content-Security-Policy injected into every sandboxed document. `default-src
 * 'none'` + no `connect-src` blocks fetch/XHR/WebSocket/beacon (no exfiltration,
 * no phone-home); `img-src`/`font-src data:` enforce "no external resources"
 * even if the model emits a CDN URL. Inline styles + scripts are the only thing
 * a self-contained document needs — including the inlined Chart.js below, which
 * is why no CDN/network allowance is required for charts.
 */
const SANDBOX_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:";

/**
 * Editorial baseline stylesheet injected into every HTML answer, so even a terse
 * document reads like a polished blog post and shares the wiki's warm paper/ink
 * folio aesthetic (with a dark-mode variant). The model's own `<style>` is
 * injected after this and overrides it freely; the predefined component classes
 * (`.lead`, `.callout`, `.grid`/`.card`, `.stat`, `.badge`, `.tabs`, `figure`)
 * are documented in the HTML format prompt so answers can opt into them.
 */
const BASE_STYLE = `<style>
:root{color-scheme:light dark;--paper:#fbfaf6;--paper-2:#f4f1e9;--ink:#1b1a16;--ink-2:#423f38;--muted:#756f62;--rule:#e2ddd0;--accent:#4d6bfe;--accent-soft:#e7ebff;--radius:12px;--head:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif}
@media (prefers-color-scheme:dark){:root{--paper:#14130f;--paper-2:#1c1b16;--ink:#efebdf;--ink-2:#c7c2b4;--muted:#948e7f;--rule:#2b281f;--accent:#90a4ff;--accent-soft:#20233a}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:clamp(20px,5vw,56px) clamp(18px,5vw,28px)}
.doc,main,article{max-width:46rem;margin:0 auto}
h1,h2,h3,h4{font-family:var(--head);line-height:1.2;font-weight:600;margin:1.8em 0 .5em}
h1{font-size:clamp(2rem,5vw,2.7rem);margin-top:0;letter-spacing:-.01em}
h2{font-size:1.6rem;padding-top:.5em;border-top:1px solid var(--rule)}
h3{font-size:1.25rem}
p,li{color:var(--ink-2)}
a{color:var(--accent);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
strong{color:var(--ink)}
hr{border:0;border-top:1px solid var(--rule);margin:2.4em 0}
.lead{font-size:1.25rem;line-height:1.5;color:var(--muted);margin:.2em 0 1.4em}
blockquote{margin:1.4em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--accent);color:var(--muted);font-style:italic}
code{font:.88em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--paper-2);padding:.12em .4em;border-radius:6px}
pre{background:var(--paper-2);border:1px solid var(--rule);border-radius:var(--radius);padding:16px;overflow:auto}
pre code{background:none;padding:0}
img,svg,canvas{max-width:100%}
table{width:100%;border-collapse:collapse;margin:1.4em 0;font-size:.95rem}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--rule)}
th{font-family:var(--head);color:var(--ink);border-bottom:2px solid var(--rule)}
tr:hover td{background:var(--paper-2)}
.callout{background:var(--accent-soft);border:1px solid var(--rule);border-radius:var(--radius);padding:16px 18px;margin:1.4em 0}
.callout>:first-child{margin-top:0}.callout>:last-child{margin-bottom:0}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));margin:1.4em 0}
.card{background:var(--paper-2);border:1px solid var(--rule);border-radius:var(--radius);padding:18px}
.card>:first-child{margin-top:0}.card>:last-child{margin-bottom:0}
.stat{display:flex;flex-direction:column;gap:2px}
.stat .num{font-family:var(--head);font-size:2.1rem;font-weight:700;color:var(--ink);line-height:1}
.stat .label{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.badge{display:inline-block;font-size:.78rem;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--rule)}
figure{margin:1.6em 0}figure>figcaption{font-size:.85rem;color:var(--muted);margin-top:.5em;text-align:center}
.chart{position:relative;height:340px}
details{border:1px solid var(--rule);border-radius:var(--radius);padding:0 16px;margin:1em 0;background:var(--paper-2)}
details[open]{padding-bottom:8px}
summary{cursor:pointer;padding:14px 0;font-family:var(--head);font-weight:600;color:var(--ink)}
.tabs .tablist{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--rule);margin-bottom:16px}
.tabs .tablist button{font:inherit;font-weight:600;color:var(--muted);background:none;border:0;border-bottom:2px solid transparent;padding:8px 12px;cursor:pointer;margin-bottom:-1px}
.tabs .tablist button.active{color:var(--accent);border-bottom-color:var(--accent)}
.tabs .tabpanel{display:none}.tabs .tabpanel.active{display:block}
input[type=range]{width:100%;accent-color:var(--accent)}
button.btn{font:inherit;font-weight:600;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer}
.sources{font-size:.9rem;color:var(--muted)}
</style>`;

/**
 * Tiny inline runtime injected into every HTML answer:
 *  - reports document height to the parent so the iframe auto-sizes (postMessage
 *    is permitted from a sandboxed frame even without same-origin access). Height
 *    is the max of documentElement.scrollHeight and body's scrollHeight/
 *    offsetHeight, and we observe `body` (not just documentElement, whose box is
 *    pinned to the iframe height) so late reflow — wrapping grids, fonts/images
 *    loading — grows the frame instead of leaving a stale-short height with an
 *    inner scrollbar;
 *  - a delegated controller for the `.tabs` component so answers get working
 *    tabs without each one re-implementing the wiring.
 */
const BASE_SCRIPT =
  `<script>(function(){` +
  `function r(){try{var e=document.documentElement,b=document.body;` +
  `var h=Math.max(e?e.scrollHeight:0,b?b.scrollHeight:0,b?b.offsetHeight:0);` +
  `parent.postMessage({${HTML_HEIGHT_MESSAGE_KEY}:Math.ceil(h)},'*')}catch(_){}}` +
  `function s(){if(typeof ResizeObserver!=='undefined'){var o=new ResizeObserver(r);` +
  `o.observe(document.documentElement);if(document.body)o.observe(document.body);}r();}` +
  `if(document.readyState!=='loading')s();else document.addEventListener('DOMContentLoaded',s);` +
  `window.addEventListener('load',r);window.addEventListener('resize',r);` +
  `[60,200,500,1000].forEach(function(t){setTimeout(r,t)});` +
  `document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.tabs .tablist button[data-tab]');` +
  `if(!b)return;var root=b.closest('.tabs');var id=b.getAttribute('data-tab');` +
  `root.querySelectorAll('.tablist button').forEach(function(x){x.classList.toggle('active',x===b)});` +
  `root.querySelectorAll('.tabpanel').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-tab')===id)});` +
  `setTimeout(r,0);});` +
  `})();</script>`;

/**
 * Does the model's HTML use Chart.js? We only inline the (~200KB) library when a
 * chart is actually present, so chartless answers stay lean. The format prompt
 * instructs the model to construct charts with `new Chart(...)`.
 */
export function usesChartLib(html: string): boolean {
  return /\bnew\s+Chart\s*\(|\bChart\.(register|defaults)\b/.test(html ?? "");
}

/**
 * Build the `<head>` injection for a given document: the CSP, `<base
 * target="_blank">` (links open in a new tab rather than navigating the frame to
 * an app route), the editorial baseline style, the Chart.js runtime (only when
 * the document uses it AND `chartLibSource` was supplied), and the resize/tabs
 * runtime. The model's own markup is injected after this string, so its
 * `<style>` overrides the baseline.
 */
function sandboxHead(html: string, chartLibSource?: string): string {
  const chartLib =
    chartLibSource && usesChartLib(html)
      ? `<script>${chartLibSource}</script>`
      : "";
  return (
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">` +
    `<base target="_blank">` +
    BASE_STYLE +
    chartLib +
    BASE_SCRIPT
  );
}

/**
 * Strip a wrapping markdown code fence (```` ```html ... ``` ````) that the model
 * sometimes adds despite being told to emit raw HTML — otherwise the fence
 * markers leak into the rendered document as literal text.
 *
 * Only acts when the content STARTS with a fence line (the model wrapping its
 * whole answer): we then drop the opening fence and, if present, a matching
 * closing fence — tolerating its absence so a still-streaming answer is handled.
 * A trailing ```` ``` ```` is NEVER stripped on its own, so real HTML that happens
 * to end with a fence-like line is left intact.
 */
export function stripHtmlFence(html: string): string {
  const out = (html ?? "").trim();
  const lead = out.match(/^```[a-z0-9]*[ \t]*\r?\n/i);
  if (!lead) return out;
  const body = out.slice(lead[0].length).replace(/\r?\n```[ \t]*$/i, "");
  return body.trim();
}

/**
 * Compose a srcdoc string from model HTML, injecting the sandbox `<head>` bits.
 * Robust to a full document, an `<html>` without a `<head>`, or a bare fragment.
 *
 * `chartLibSource` (the Chart.js UMD source) is injected only when the document
 * actually uses charts; pass it from a lazy `import()` of `vendor/chartjs.generated`
 * so the heavy library stays out of the default client bundle.
 */
export function composeSrcDoc(html: string, chartLibSource?: string): string {
  const src = stripHtmlFence(html);
  const head = sandboxHead(src, chartLibSource);

  const headOpen = src.match(/<head[^>]*>/i);
  if (headOpen?.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return src.slice(0, at) + head + src.slice(at);
  }

  const htmlOpen = src.match(/<html[^>]*>/i);
  if (htmlOpen?.index !== undefined) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${src.slice(0, at)}<head>${head}</head>${src.slice(at)}`;
  }

  return `<!doctype html><html><head>${head}</head><body>${src}</body></html>`;
}

/**
 * Strip HTML to plain text for DERIVED text only (summary, search/embedding) —
 * never for rendering. Drops `<script>`/`<style>` bodies, removes tags, decodes
 * a few common entities, and collapses whitespace.
 */
export function htmlToPlainText(html: string): string {
  return (html ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
