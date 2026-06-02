// ---------------------------------------------------------------------------
// Slug generation — single canonical implementation
// ---------------------------------------------------------------------------

/**
 * Characters allowed in a slug: ASCII alphanumerics plus CJK (Han incl. Ext-A
 * and compatibility ideographs, Japanese kana, Korean hangul). Everything else
 * (punctuation, whitespace, symbols) acts as a separator.
 *
 * CJK is preserved rather than stripped/transliterated so Chinese/Japanese/
 * Korean titles produce meaningful slugs (e.g. "知识库" → "知识库"), the way
 * Wikipedia does. Pinyin transliteration was rejected: it needs a dictionary
 * that would bloat the Worker bundle. UTF-8 slugs are valid in URLs
 * (percent-encoded), R2 keys, and file paths.
 */
const SLUG_SEPARATOR_RE =
  /[^a-z0-9\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]+/g;

/**
 * Convert a title into a URL-safe slug: lowercase, runs of disallowed
 * characters collapse to a single hyphen, leading/trailing hyphens trimmed.
 * CJK characters are kept (see {@link SLUG_SEPARATOR_RE}).
 *
 * Runs of non-allowed characters collapse to a single hyphen, so `"hello--world"`
 * and `"hello  world"` both produce `"hello-world"`.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(SLUG_SEPARATOR_RE, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Decode a slug taken from a URL path parameter.
 *
 * Browsers percent-encode non-ASCII (CJK) slugs in the address bar, and some
 * runtimes (notably OpenNext on Cloudflare Workers) deliver the route param
 * still percent-encoded — so `/wiki/检索增强生成` arrives as
 * `%E6%A3%80%E7%B4%A2...` and a raw lookup 404s. Decoding is safe because a
 * valid slug never contains a literal `%` (see `validateSlug`); on malformed
 * input we fall back to the raw value rather than throw.
 */
export function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}
