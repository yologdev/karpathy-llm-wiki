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

/** Hard cap (px) on a sandboxed frame's reported height — bounds a runaway/hostile grow. */
export const HTML_MAX_HEIGHT = 4000;

/** Message shape posted by the sandboxed frame to report its height. */
export const HTML_HEIGHT_MESSAGE_KEY = "__wikiHtmlHeight";

/**
 * Content-Security-Policy injected into every sandboxed document. `default-src
 * 'none'` + no `connect-src` blocks fetch/XHR/WebSocket/beacon (no exfiltration,
 * no phone-home); `img-src`/`font-src data:` enforce "no external resources"
 * even if the model emits a CDN URL. Inline styles + scripts are the only thing
 * a self-contained document needs.
 */
const SANDBOX_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:";

/**
 * Injected into the document `<head>`: the CSP, `<base target="_blank">` (any
 * link opens in a new tab rather than navigating the frame to an app route), and
 * a tiny resize reporter (postMessage is permitted from a sandboxed frame even
 * without same-origin access).
 */
const SANDBOX_HEAD =
  `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">` +
  `<base target="_blank">` +
  `<script>(function(){function r(){try{parent.postMessage({${HTML_HEIGHT_MESSAGE_KEY}:` +
  `Math.ceil(document.documentElement.scrollHeight)},'*')}catch(e){}}` +
  `if(typeof ResizeObserver!=='undefined'){new ResizeObserver(r).observe(document.documentElement);}` +
  `window.addEventListener('load',r);setTimeout(r,60);})();</script>`;

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
 */
export function composeSrcDoc(html: string): string {
  const src = stripHtmlFence(html);

  const headOpen = src.match(/<head[^>]*>/i);
  if (headOpen?.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return src.slice(0, at) + SANDBOX_HEAD + src.slice(at);
  }

  const htmlOpen = src.match(/<html[^>]*>/i);
  if (htmlOpen?.index !== undefined) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${src.slice(0, at)}<head>${SANDBOX_HEAD}</head>${src.slice(at)}`;
  }

  return `<!doctype html><html><head>${SANDBOX_HEAD}</head><body>${src}</body></html>`;
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
