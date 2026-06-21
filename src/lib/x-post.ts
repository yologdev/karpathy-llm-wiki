/**
 * X (Twitter) post fetching module.
 *
 * X.com serves a JavaScript shell to plain HTTP fetches — readers get a
 * "Something went wrong" error page, never the tweet. This module instead reads
 * a single post via the public **syndication CDN** (`cdn.syndication.twimg.com`,
 * the endpoint that powers embedded tweets), which returns the post's text,
 * author, media, and any quoted tweet as JSON — no API key required.
 *
 * Long-form **X Articles** carry their body in the authenticated X API v2
 * `article` field. Only the **recent-search** endpoint actually populates
 * `article.text` — a plain `GET /2/tweets/:id?tweet.fields=article` returns the
 * title with an empty body — so when `X_BEARER_TOKEN` is configured we fetch the
 * article via the same recent-search-by-`conversation_id` request the @yoyo
 * mention worker relies on. We fall back to syndication for plain tweets / no token /
 * articles older than the ~7-day search window — and there we use the
 * `article.preview_text` teaser + cover so an article still ingests with its
 * gist rather than just the bare link.
 *
 * Self-contained: URL detection, tweet-ID extraction, fetch, and markdown
 * formatting, with no dependency on the ingest pipeline (mirrors `youtube.ts`).
 */

import { logger } from "./logger";
import { ClientInputError } from "./errors";

// ---------------------------------------------------------------------------
// Types (subset of the syndication `tweet-result` response we consume)
// ---------------------------------------------------------------------------

interface SyndicationMedia {
  type?: string; // "photo" | "video" | "animated_gif"
  media_url_https?: string;
  ext_alt_text?: string;
}

interface SyndicationUrlEntity {
  url?: string; // the t.co short link as it appears in `text`
  expanded_url?: string;
  display_url?: string;
}

interface SyndicationTweet {
  text?: string;
  created_at?: string;
  user?: { name?: string; screen_name?: string };
  entities?: { urls?: SyndicationUrlEntity[] };
  mediaDetails?: SyndicationMedia[];
  photos?: SyndicationMedia[];
  quoted_tweet?: SyndicationTweet;
  // Long-form Article payload (the syndication CDN exposes a truncated
  // `preview_text` + cover, but not the full body — that needs the API).
  article?: {
    title?: string;
    preview_text?: string;
    cover_media?: { media_info?: { original_img_url?: string } };
  };
  // Error shapes the endpoint may return instead of a tweet.
  error?: string;
  tombstone?: unknown;
  __typename?: string;
}

export interface XPostContent {
  title: string;
  content: string;
}

// ---------------------------------------------------------------------------
// URL detection
// ---------------------------------------------------------------------------

/** Hostnames that serve X/Twitter posts (case-insensitive). */
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

/** A status URL path: `/<handle>/status/<id>` or `/i/web/status/<id>`. */
const STATUS_PATH_RE = /\/status(?:es)?\/(\d+)/;

/** Returns `true` for an X/Twitter URL pointing at a specific post. */
export function isXPostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!X_HOSTS.has(parsed.hostname.toLowerCase())) return false;
    return STATUS_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Extracts the numeric tweet ID from an X/Twitter status URL, or `null`. */
export function extractTweetId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!X_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.pathname.match(STATUS_PATH_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Syndication fetch
// ---------------------------------------------------------------------------

/**
 * Derive the syndication request token from the tweet ID — the same scheme the
 * official tweet-embed widget (react-tweet) uses. The endpoint rejects requests
 * without a plausible token, so this is required, not cosmetic.
 */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36) // 6 ** 2
    .replace(/(0+|\.)/g, "");
}

/** Fetch the raw syndication payload for a tweet ID (throws on HTTP failure). */
async function fetchSyndication(id: string): Promise<SyndicationTweet> {
  const endpoint =
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}` +
    `&lang=en&token=${syndicationToken(id)}`;

  const res = await fetch(endpoint, {
    // The CDN serves the JSON only to browser-like clients.
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });

  if (res.status === 404) {
    throw new ClientInputError(
      "That X post couldn't be found — it may be deleted, private, or from a protected account.",
    );
  }
  if (!res.ok) {
    throw new Error(`X syndication request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as SyndicationTweet;
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

/** Replace t.co short links in the text with their expanded URLs. */
function expandLinks(text: string, urls?: SyndicationUrlEntity[]): string {
  let out = text;
  for (const u of urls ?? []) {
    if (u.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
  }
  return out;
}

/**
 * Photo refs as markdown image lines (videos/gifs contribute their poster).
 *
 * The CDN may carry media under `mediaDetails` OR `photos` — prefer whichever
 * is non-empty (not just non-null), and keep only entries with a real URL.
 */
function mediaImageRefs(tweet: SyndicationTweet): string[] {
  const media = tweet.mediaDetails?.length ? tweet.mediaDetails : tweet.photos ?? [];
  return media
    .filter((m) => m.media_url_https)
    .map((m) => `![${(m.ext_alt_text || "image").replace(/\s+/g, " ").trim()}](${m.media_url_https})`);
}

/** True if the tweet (or the tweet it quotes) has any text or media to render. */
function hasRenderableContent(tweet: SyndicationTweet): boolean {
  const hasOwn = (t: SyndicationTweet) =>
    (t.text ?? "").trim().length > 0 || mediaImageRefs(t).length > 0;
  return hasOwn(tweet) || (tweet.quoted_tweet ? hasOwn(tweet.quoted_tweet) : false);
}

/** Build a concise wiki-ingestion title from the author + text opening. */
function deriveTitle(tweet: SyndicationTweet, text: string): string {
  const author = tweet.user?.name || tweet.user?.screen_name || "X post";
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const snippet = firstLine.length > 70 ? firstLine.slice(0, 70).trim() + "…" : firstLine;
  return snippet ? `${author}: ${snippet}` : `${author} on X`;
}

/** Format a fetched tweet as the markdown the ingest pipeline distills. */
function formatTweetAsMarkdown(tweet: SyndicationTweet, url: string): XPostContent {
  const text = expandLinks(tweet.text ?? "", tweet.entities?.urls);
  const handle = tweet.user?.screen_name ? `@${tweet.user.screen_name}` : "";
  const name = tweet.user?.name ?? "";
  const byline = [name, handle].filter(Boolean).join(" ");
  const title = deriveTitle(tweet, text);

  const lines: string[] = [`# ${title}`, ""];
  if (byline) lines.push(`**${byline}** · X post`, "");
  if (text) lines.push(text, "");
  for (const ref of mediaImageRefs(tweet)) lines.push(ref, "");

  const quoted = tweet.quoted_tweet;
  if (quoted?.text) {
    const qBy = quoted.user?.screen_name ? `@${quoted.user.screen_name}` : "quoted";
    const qText = expandLinks(quoted.text, quoted.entities?.urls)
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    lines.push(`**Quoting ${qBy}:**`, "", qText, "");
    for (const ref of mediaImageRefs(quoted)) lines.push(ref, "");
  }

  lines.push(`**Source:** [${url}](${url})`);
  return { title, content: lines.join("\n").trim() };
}

// ---------------------------------------------------------------------------
// Long-form X Articles — via the authenticated X API v2
// ---------------------------------------------------------------------------

/** Subset of the X API v2 recent-search response we read (data is an ARRAY). */
interface XApiSearchResponse {
  data?: Array<{
    id?: string;
    text?: string;
    article?: { title?: string; text?: string };
  }>;
}

/** The `@handle` from an X status URL (`/i/...` has none) — for the byline. */
function handleFromUrl(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0];
    return seg && seg.toLowerCase() !== "i" ? seg : null;
  } catch {
    return null;
  }
}

/** The Article's cover/hero image via the syndication CDN (the API exposes
 *  none). Best-effort: any error / shape change → null. */
async function fetchArticleCover(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      article?: { cover_media?: { media_info?: { original_img_url?: string } } };
    };
    return data.article?.cover_media?.media_info?.original_img_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a long-form X Article's full body via the authenticated X API v2.
 *
 * Uses the **recent-search** endpoint (`conversation_id:<id>`), the same
 * recent-search request the @yoyo mention worker relies on — this is the only X
 * API call that actually populates `article.text`. (The plain `GET /2/tweets/:id?tweet.fields=article`
 * returns the title with an EMPTY body, which is why the previous version
 * produced title-only article pages.) Recent-search only covers ~7 days, so
 * older articles return nothing here and the caller falls back to the
 * syndication teaser.
 *
 * Returns `null` (caller falls back to syndication) when there's no
 * `X_BEARER_TOKEN`, the post isn't a (recent) article, or the API call fails —
 * a token/rate-limit hiccup must never break plain-tweet ingest.
 */
async function fetchArticleViaApi(id: string, url: string): Promise<XPostContent | null> {
  const bearer = process.env.X_BEARER_TOKEN;
  // No token → can't reach the article body. Return null and let the caller fall
  // back to the syndication teaser; it logs when the post turns out to be an
  // article, so a missing token is visible rather than a silent degrade.
  if (!bearer) return null;
  const handle = handleFromUrl(url);
  // `conversation_id:<id>` returns the article tweet (root of its own
  // conversation); `from:<handle>` narrows it when the URL carries the author.
  const query = handle
    ? `conversation_id:${id} from:${handle}`
    : `conversation_id:${id}`;
  const endpoint =
    `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}` +
    `&max_results=10&tweet.fields=article,conversation_id`;
  let tweets: NonNullable<XApiSearchResponse["data"]>;
  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) {
      // A 401/403 means the bearer token is bad/expired/under-privileged — a
      // CONFIG defect that would otherwise silently degrade EVERY article to a
      // teaser. Make it loud (error); transient 429/5xx stay a warn. Both fall
      // back to syndication so plain-tweet ingest is never broken.
      if (res.status === 401 || res.status === 403) {
        logger.error(
          "x-post",
          `X API rejected the bearer token (HTTP ${res.status}) — X_BEARER_TOKEN is likely expired/revoked or lacks article access; article ingest is degraded to teaser-only`,
        );
      } else {
        logger.warn(
          "x-post",
          `X API article fetch failed (HTTP ${res.status}) for ${id}; degrading to the syndication teaser — full body not ingested`,
        );
      }
      return null;
    }
    tweets = ((await res.json()) as XApiSearchResponse).data ?? [];
  } catch (err) {
    // Only the network/JSON read is guarded → a transient fetch failure falls
    // back to syndication. Tweet SELECTION + formatting live below, outside the
    // try, so a response-shape or logic defect throws to the caller instead of
    // silently degrading EVERY article to a teaser (the 401/403 case is loud for
    // the same reason).
    logger.warn("x-post", `X API article fetch error for ${id}; using syndication`, err);
    return null;
  }

  // The article tweet is the conversation root (id matches the URL); fall back
  // to the first result that carries an article.
  const tweet = tweets.find((t) => t.id === id) ?? tweets.find((t) => t.article);
  const article = tweet?.article;
  if (!article || (!article.text?.trim() && !article.title?.trim())) return null;

  const title = article.title?.trim() || "X Article";
  const cover = await fetchArticleCover(id);
  const lines: string[] = [`# ${title}`, ""];
  if (handle) lines.push(`**@${handle}** · X Article`, "");
  if (cover) lines.push(`![${title}](${cover})`, "");
  const body = article.text?.trim();
  if (body) lines.push(body, "");
  lines.push(`**Source:** [${url}](${url})`);
  return { title, content: lines.join("\n").trim() };
}

/**
 * Sentinel line stamped onto a teaser-only X Article page (full body NOT
 * fetched). Lets the ingest dedup recognize a page that's still a teaser and
 * auto-upgrade it on a later re-ingest once the API can serve the full body —
 * see {@link isXArticleTeaser}.
 */
export const X_ARTICLE_TEASER_NOTE =
  "_Article preview only — see the source for the full article._";

/**
 * True when `content` is a teaser-only X Article (the full body wasn't fetched).
 * Substring match on the stable part of {@link X_ARTICLE_TEASER_NOTE} so light
 * edits to the surrounding punctuation don't defeat detection.
 */
export function isXArticleTeaser(content: string): boolean {
  return content.includes("Article preview only");
}

/**
 * Build an article page from the syndication CDN's truncated `preview_text` +
 * cover — the fallback when the API can't serve the full body (no token, an
 * article older than the recent-search window, or a rate-limit hiccup). Returns
 * `null` when the payload isn't an article, so a plain tweet is unaffected.
 */
function formatSyndicationArticle(
  tweet: SyndicationTweet,
  url: string,
): XPostContent | null {
  const art = tweet.article;
  const preview = art?.preview_text?.trim();
  // Require an actual teaser body: a title/cover with no preview_text would be a
  // body-free stub dressed as a full article — return null so the empty-payload
  // gate in the caller rejects it instead.
  if (!art || !preview) return null;

  const title = art.title?.trim() || "X Article";
  const handle = handleFromUrl(url);
  const cover = art.cover_media?.media_info?.original_img_url;
  const lines: string[] = [`# ${title}`, ""];
  if (handle) lines.push(`**@${handle}** · X Article`, "");
  if (cover) lines.push(`![${title}](${cover})`, "");
  lines.push(preview, "");
  // Be honest this is the truncated teaser, not the full body, so the page (and
  // the ingest dedup) can tell it's partial and auto-upgrade once available.
  lines.push(X_ARTICLE_TEASER_NOTE, "");
  lines.push(`**Source:** [${url}](${url})`);
  return { title, content: lines.join("\n").trim() };
}

// ---------------------------------------------------------------------------
// High-level entry point
// ---------------------------------------------------------------------------

/**
 * Fetch an X/Twitter post ready for ingestion.
 *
 * 1. Extract the tweet ID (throws on an unrecognized URL).
 * 2. If it's a long-form Article and `X_BEARER_TOKEN` is set, read the full
 *    body via the X API v2; an article the API can't serve (no token / older
 *    than the ~7-day search window) falls back to the syndication preview_text +
 *    cover teaser; a plain tweet reads from the syndication CDN.
 * 3. Return the content (article body/teaser, or tweet text + media + quoted
 *    tweet) as markdown.
 *
 * Throws a {@link ClientInputError} for a missing/private/deleted post so the
 * caller surfaces a useful message rather than ingesting an error page.
 */
export async function fetchXPostContent(url: string): Promise<XPostContent> {
  const id = extractTweetId(url);
  if (!id) throw new ClientInputError(`Not a recognizable X post URL: "${url}"`);

  // Long-form Article body (authenticated) when available — else plain tweet.
  const article = await fetchArticleViaApi(id, url);
  if (article) return article;

  const tweet = await fetchSyndication(id);
  // An article the API couldn't serve (no token / older than the search window):
  // use the syndication preview_text + cover so it ingests with its gist rather
  // than just the teaser tweet's bare t.co link. Gated on the error/tombstone
  // signal so a deleted/private post with a STALE cached `article` object still
  // rejects below instead of ingesting as a stub.
  if (!tweet.error && !tweet.tombstone) {
    const previewArticle = formatSyndicationArticle(tweet, url);
    if (previewArticle) {
      // It IS a long-form Article, but we only have the ~200-char teaser — make
      // WHY visible so the shrunk body isn't mistaken for a synthesis bug, and
      // call out the actionable missing-token case.
      logger.warn(
        "x-post",
        process.env.X_BEARER_TOKEN
          ? // Token is set, so the body wasn't fetched for one of a few reasons.
            // Don't assert a single cause here: an API error (bad/rate-limited
            // token) was already logged precisely by fetchArticleViaApi, while an
            // out-of-window / no-article result returned silently. List both and
            // point at any preceding x-post log rather than guess wrong.
            `X Article ${id} ingested as the syndication TEASER only — full body not fetched (article outside X's ~7-day recent-search window, or the X API call failed; see any preceding x-post log for the exact cause).`
          : `X Article ${id} ingested as the syndication TEASER only — X_BEARER_TOKEN is not set on this worker, so the full body can't be fetched. Set it to ingest full X Articles.`,
      );
      return previewArticle;
    }
  }
  // Reject only a genuinely empty payload — no renderable text/media on the
  // tweet itself OR the tweet it quotes (mirrors the media set the formatter
  // actually emits, covering the `photos` shape and URL-less entries) — so a
  // benign-but-empty response errors instead of producing a content-free stub.
  if (tweet.error || tweet.tombstone || !hasRenderableContent(tweet)) {
    logger.warn("x-post", `No usable content for tweet ${id} (error/tombstone/empty)`);
    throw new ClientInputError(
      "That X post couldn't be read — it may be deleted, private, or from a protected account.",
    );
  }

  return formatTweetAsMarkdown(tweet, url);
}
