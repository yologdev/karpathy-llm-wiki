// Capture surfaces — the shared logic behind the three no-extension ways to send
// a URL to yopedia for ingesting: a desktop bookmarklet, the PWA Web Share Target
// (Android), and an iOS Shortcut. All three land on `/save`, which fires the
// existing authed `POST /api/ingest`. These helpers are pure so they're testable
// in isolation (the surfaces themselves are a page + a manifest).

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/**
 * Resolve the URL to ingest from a capture request's params. Prefers an explicit
 * `url`, but falls back to the FIRST http(s) link found in `text` — the Web Share
 * Target spec lets a sharing app drop the link into `text` instead of `url` (many
 * Android apps do), so we recover it. Returns null when neither yields a URL.
 */
export function resolveSharedUrl(
  url?: string | null,
  text?: string | null,
): string | null {
  const direct = (url ?? "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const fromText = (text ?? "").match(URL_RE)?.[0];
  return fromText ?? null;
}

/**
 * Build the desktop bookmarklet for a given site origin. Clicking it on any page
 * opens yopedia's `/save` in a small popup, passing the current tab's URL + title.
 * The popup loads on yopedia's OWN origin, so the user's existing session cookie
 * authenticates the save — no token, no CORS. Generated from the live origin so it
 * always points at wherever yopedia is served (e.g. yopedia.yolog.dev).
 */
/**
 * Display host for a URL — the hostname without a leading `www.`, or the raw
 * input unchanged if it doesn't parse. Used by the capture UI to show
 * "example.com" instead of a long URL.
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function buildBookmarklet(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return (
    "javascript:(function(){window.open('" +
    base +
    "/save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)," +
    "'yopedia-save','width=440,height=620,noopener=no');})();"
  );
}
