import net from "net";
import fs from "fs/promises";
import path from "path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import {
  MAX_RESPONSE_SIZE,
  MAX_CONTENT_LENGTH,
  FETCH_TIMEOUT_MS,
  MAX_IMAGES_PER_SOURCE,
} from "./constants";

// ---------------------------------------------------------------------------
// URL detection & fetching
// ---------------------------------------------------------------------------

/** Check if a string looks like a URL (starts with http:// or https://). */
export function isUrl(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

/**
 * Strip HTML to plain text using a simple regex-based approach.
 *
 * 1. Remove <script>, <style>, <nav>, <header>, <footer> elements entirely
 * 2. Strip remaining HTML tags
 * 3. Decode common HTML entities
 * 4. Collapse whitespace
 */
export function stripHtml(html: string): string {
  let text = html;

  // Remove elements whose content should be discarded entirely
  const removeTags = ["script", "style", "nav", "header", "footer", "noscript"];
  for (const tag of removeTags) {
    const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    text = text.replace(re, " ");
  }

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Common named HTML5 entities
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&trade;/g, "\u2122")
    .replace(/&copy;/g, "\u00A9")
    .replace(/&reg;/g, "\u00AE")
    .replace(/&bull;/g, "\u2022")
    .replace(/&middot;/g, "\u00B7")
    // Numeric entities: &#123; and &#x1F;
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// ---------------------------------------------------------------------------
// HTML → Markdown converter (lightweight, no external deps)
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities to their plain-text equivalents.
 * Shared between `stripHtml` (above) and `htmlToMarkdown`.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&trade;/g, "\u2122")
    .replace(/&copy;/g, "\u00A9")
    .replace(/&reg;/g, "\u00AE")
    .replace(/&bull;/g, "\u2022")
    .replace(/&middot;/g, "\u00B7")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    );
}

/**
 * Convert simple HTML to markdown.
 *
 * Handles the subset of HTML that Readability typically outputs:
 *   - `<img>` → `![alt](src)`
 *   - `<a>` → `[text](href)`
 *   - `<h1>`–`<h6>` → `#`–`######`
 *   - `<p>` → double newline
 *   - `<strong>/<b>` → `**text**`
 *   - `<em>/<i>` → `*text*`
 *   - `<ul>/<li>` → `- item`
 *   - `<br>` → newline
 *   - Strips all other tags while preserving their text content.
 *
 * No external dependencies — pure regex/string processing.
 */
export function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove <script>, <style>, <nav>, <header>, <footer> blocks entirely
  const removeTags = ["script", "style", "nav", "header", "footer", "noscript"];
  for (const tag of removeTags) {
    const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    md = md.replace(re, "");
  }

  // --- Block-level elements ---

  // Headings: <h1>–<h6>
  for (let level = 1; level <= 6; level++) {
    const re = new RegExp(
      `<h${level}[^>]*>([\\s\\S]*?)</h${level}>`,
      "gi",
    );
    const prefix = "#".repeat(level);
    md = md.replace(re, (_, inner) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      return `\n\n${prefix} ${decodeEntities(text)}\n\n`;
    });
  }

  // Images (self-closing or void): <img src="..." alt="..."> / <img ... />
  // Must be processed BEFORE stripping other tags, since <img> is void.
  md = md.replace(
    /<img\s[^>]*?\bsrc\s*=\s*"([^"]*)"[^>]*?\balt\s*=\s*"([^"]*)"[^>]*\/?>/gi,
    (_, src, alt) => `![${decodeEntities(alt)}](${src})`,
  );
  md = md.replace(
    /<img\s[^>]*?\balt\s*=\s*"([^"]*)"[^>]*?\bsrc\s*=\s*"([^"]*)"[^>]*\/?>/gi,
    (_, alt, src) => `![${decodeEntities(alt)}](${src})`,
  );
  // Images with no alt attribute
  md = md.replace(
    /<img\s[^>]*?\bsrc\s*=\s*"([^"]*)"[^>]*\/?>/gi,
    (_, src) => `![](${src})`,
  );

  // Paragraphs
  md = md.replace(/<p[^>]*>/gi, "\n\n");
  md = md.replace(/<\/p>/gi, "\n\n");

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Lists
  md = md.replace(/<\/?ul[^>]*>/gi, "\n");
  md = md.replace(/<\/?ol[^>]*>/gi, "\n");
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    return `- ${decodeEntities(text)}\n`;
  });

  // --- Inline elements ---

  // Bold: <strong> and <b>
  md = md.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    return `**${text}**`;
  });

  // Italic: <em> and <i>
  md = md.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    return `*${text}*`;
  });

  // Links: <a href="...">text</a>
  md = md.replace(
    /<a\s[^>]*?\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, inner) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      return `[${decodeEntities(text)}](${href})`;
    },
  );

  // Strip all remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = decodeEntities(md);

  // Clean up excessive whitespace
  // Collapse 3+ newlines to 2
  md = md.replace(/\n{3,}/g, "\n\n");
  // Collapse spaces/tabs on a single line (but preserve newlines)
  md = md.replace(/[^\S\n]+/g, " ");
  // Remove leading/trailing spaces on each line
  md = md
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  return md.trim();
}

/**
 * Extract the <title> content from HTML.
 * Falls back to empty string if not found.
 */
export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  // Strip any inner tags and collapse whitespace
  return match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Extract article content from HTML using @mozilla/readability + linkedom.
 * Returns `null` when Readability cannot identify an article in the page.
 *
 * Returns both `textContent` (plain text, for backward compat) and
 * `htmlContent` (sanitised HTML that Readability produces, which preserves
 * images, links, and formatting).
 */
export function extractWithReadability(
  html: string,
): { title: string; textContent: string; htmlContent: string } | null {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 0) {
      return {
        title: article.title || "",
        textContent: article.textContent.trim(),
        htmlContent: article.content || "",
      };
    }
    return null;
  } catch (err) {
    console.warn("[ingest] Readability extraction failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

/** Blocked hostname suffixes for local/internal DNS names. */
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

/** Blocked exact hostnames. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

/**
 * Check whether an IPv4 address string falls in a private/reserved range.
 *
 *  - 10.0.0.0/8
 *  - 172.16.0.0/12
 *  - 192.168.0.0/16
 *  - 169.254.0.0/16 (link-local, cloud metadata)
 *  - 127.0.0.0/8 (loopback)
 *  - 0.0.0.0/8
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Check whether an IPv6 address string falls in a private/reserved range.
 *
 *  - ::1 (loopback)
 *  - fd00::/8 (unique local address)
 *  - fe80::/10 (link-local)
 */
function isPrivateIPv6(ip: string): boolean {
  // Normalise: lowercase, strip brackets
  const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;

  // IPv4-mapped IPv6: ::ffff:A.B.C.D or ::ffff:XXXX:XXXX (hex form)
  if (normalized.startsWith("::ffff:")) {
    const suffix = normalized.slice(7); // after "::ffff:"
    if (net.isIPv4(suffix)) {
      // Dotted-decimal form: ::ffff:127.0.0.1
      return isPrivateIPv4(suffix);
    }
    // Hex form: ::ffff:7f00:1 (URL class normalizes to this)
    const hexMatch = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }

  return false;
}

/**
 * Validate that a URL is safe to fetch — reject private/reserved addresses
 * and non-HTTP(S) schemes to prevent SSRF attacks.
 *
 * @throws Error if the URL targets a private/reserved address or uses a
 *   non-HTTP(S) scheme.
 */
export function validateUrlSafety(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    console.warn("[ingest] URL parse failed:", err);
    throw new Error("URL blocked: invalid URL");
  }

  // Only allow http and https schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `URL blocked: scheme "${parsed.protocol.replace(":", "")}" is not allowed (only http/https)`,
    );
  }

  // Extract hostname (URL class may keep brackets around IPv6 literals)
  const rawHostname = parsed.hostname.toLowerCase();
  // Strip brackets for IPv6 literals so lookups work correctly
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;

  // Check exact blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(
      "URL blocked: hostname resolves to a private/reserved address",
    );
  }

  // Check blocked suffixes
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(
        "URL blocked: hostname resolves to a private/reserved address",
      );
    }
  }

  // If the hostname is a raw IP address, check private ranges
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    throw new Error(
      "URL blocked: hostname resolves to a private/reserved address",
    );
  }
  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    throw new Error(
      "URL blocked: hostname resolves to a private/reserved address",
    );
  }
}

// MIME types that fetchUrlContent will accept. Anything outside this list
// (e.g. application/pdf, image/png) is rejected early to avoid feeding binary
// garbage into the HTML-parsing pipeline.
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/xml",
  "text/xml",
];

/**
 * Fetch a URL and extract its text content and title.
 *
 * Uses @mozilla/readability + linkedom for robust HTML-to-text extraction.
 * Falls back to regex-based `stripHtml()` when Readability can't parse the page.
 * Applies a 15-second timeout and a 5 MB response size limit for safety.
 *
 * For `text/plain` and `text/markdown` responses the raw text is returned
 * directly (no HTML parsing).
 */
export async function fetchUrlContent(
  url: string,
): Promise<{ title: string; content: string }> {
  // SSRF protection: reject private/reserved addresses before fetching
  validateUrlSafety(url);

  // Maximum number of redirect hops to follow
  const MAX_REDIRECTS = 5;
  const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

  let currentUrl = url;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "llm-wiki/1.0",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      break; // Not a redirect — proceed with this response
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect (${response.status}) without Location header`);
    }

    // Resolve relative redirects against the current URL
    const resolvedUrl = new URL(location, currentUrl).toString();

    // SSRF: validate the redirect target before following it
    validateUrlSafety(resolvedUrl);

    currentUrl = resolvedUrl;

    if (hop === MAX_REDIRECTS) {
      throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
    }
  }

  if (!response) {
    throw new Error("No response received");
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`,
    );
  }

  // ---------- Content-Type validation ----------
  const rawContentType = response.headers.get("content-type");
  // Extract the MIME type (before any ";charset=..." parameters)
  const mimeType = rawContentType
    ? rawContentType.split(";")[0].trim().toLowerCase()
    : null;

  if (mimeType && !ALLOWED_CONTENT_TYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported content type: ${mimeType}. Only HTML and text content can be ingested.`,
    );
  }

  // Check Content-Length header before reading body (early rejection)
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    throw new Error(
      `Content too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`,
    );
  }

  // Stream the body and enforce size limit incrementally to prevent
  // unbounded memory consumption from servers with missing/spoofed
  // Content-Length headers.
  let body: string;
  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let accumulated = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.length > MAX_RESPONSE_SIZE) {
        await reader.cancel();
        throw new Error(
          `Content too large (max ${MAX_RESPONSE_SIZE})`,
        );
      }
    }
    // Flush any remaining bytes in the decoder
    accumulated += decoder.decode();
    body = accumulated;
  } else {
    // Fallback: no streaming body available (e.g. in some test environments)
    body = await response.text();
    if (body.length > MAX_RESPONSE_SIZE) {
      throw new Error(
        `Content too large (max ${MAX_RESPONSE_SIZE})`,
      );
    }
  }

  let title: string;
  let content: string;

  // For plain-text and markdown responses, skip the HTML parsing path entirely
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    title = new URL(url).hostname;
    content = body.trim();
  } else {
    // HTML / XHTML / XML path — try Readability first for proper article extraction
    const article = extractWithReadability(body);
    if (article) {
      title = article.title || extractTitle(body) || new URL(url).hostname;
      // Convert Readability's sanitised HTML to markdown so we preserve
      // images, links, headings, and formatting from the source article.
      content = htmlToMarkdown(article.htmlContent);
    } else {
      // Fallback to regex-based stripping for non-article pages
      title = extractTitle(body) || new URL(url).hostname;
      content = stripHtml(body);
    }
  }

  if (!content) {
    throw new Error("No text content could be extracted from the URL");
  }

  // Truncate very long extracted text to a reasonable size for LLM processing
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]";
  }

  return { title, content };
}

// ---------------------------------------------------------------------------
// Image downloading
// ---------------------------------------------------------------------------

/** Regex matching markdown image references: ![alt](url) */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Sanitise a URL-derived filename: strip query/hash, prevent path traversal,
 * and ensure it has a reasonable extension.
 */
function sanitizeImageFilename(rawUrl: string): string {
  let urlPath: string;
  try {
    urlPath = new URL(rawUrl).pathname;
  } catch (err) {
    // Not a valid URL — fallback to the raw string
    if (!(err instanceof TypeError)) {
      console.warn("[fetch] unexpected error parsing URL:", err);
    }
    urlPath = rawUrl;
  }

  // Take only the last path segment
  let name = urlPath.split("/").pop() || "image";

  // Remove any query params or hash that slipped through
  name = name.split("?")[0].split("#")[0];

  // Replace path-traversal sequences and dangerous chars
  name = name.replace(/\.\./g, "_").replace(/[/\\:*?"<>|]/g, "_");

  // If the name is empty or only whitespace after sanitisation, use a default
  if (!name.trim()) {
    name = "image";
  }

  // Ensure a reasonable extension if missing
  const VALID_IMAGE_EXTS = new Set([
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
  ]);
  const ext = path.extname(name).toLowerCase();
  if (!VALID_IMAGE_EXTS.has(ext)) {
    name += ".jpg"; // default extension
  }

  return name;
}

/**
 * Download images referenced in markdown content to the local filesystem.
 * Rewrites image URLs in the markdown to point to local paths.
 *
 * @param markdown - Markdown content with `![alt](url)` image references
 * @param slug - The source slug (used to namespace image files)
 * @param rawDir - The raw directory path
 * @returns The markdown with rewritten image URLs
 */
export async function downloadImages(
  markdown: string,
  slug: string,
  rawDir: string,
): Promise<string> {
  // Collect all absolute-URL image references
  const matches: Array<{ full: string; alt: string; url: string }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MD_IMAGE_RE.source, MD_IMAGE_RE.flags);
  while ((m = re.exec(markdown)) !== null) {
    const url = m[2];
    // Skip data URIs and relative paths
    if (url.startsWith("data:")) continue;
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    matches.push({ full: m[0], alt: m[1], url });
  }

  if (matches.length === 0) return markdown;

  // Limit to MAX_IMAGES_PER_SOURCE to avoid abuse
  const toDownload = matches.slice(0, MAX_IMAGES_PER_SOURCE);

  // Ensure the asset directory exists
  const assetDir = path.join(rawDir, "assets", slug);
  await fs.mkdir(assetDir, { recursive: true });

  // Track used filenames for deduplication
  const usedNames = new Map<string, number>();

  // Build a replacement map: original markdown → rewritten markdown
  const replacements = new Map<string, string>();

  for (const { full, alt, url } of toDownload) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!resp.ok) {
        console.warn(`[downloadImages] HTTP ${resp.status} for ${url}, keeping original`);
        continue;
      }

      // Check content-type is an image
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        console.warn(`[downloadImages] Non-image content-type "${contentType}" for ${url}, keeping original`);
        continue;
      }

      const arrayBuf = await resp.arrayBuffer();
      // Respect MAX_RESPONSE_SIZE
      if (arrayBuf.byteLength > MAX_RESPONSE_SIZE) {
        console.warn(`[downloadImages] Image too large (${arrayBuf.byteLength} bytes) for ${url}, keeping original`);
        continue;
      }

      // Determine local filename (deduplicate if needed)
      let filename = sanitizeImageFilename(url);
      const baseName = path.basename(filename, path.extname(filename));
      const ext = path.extname(filename);
      const count = usedNames.get(filename) ?? 0;
      if (count > 0) {
        filename = `${baseName}-${count}${ext}`;
      }
      usedNames.set(
        `${baseName}${ext}`,
        count + 1,
      );

      const filePath = path.join(assetDir, filename);
      await fs.writeFile(filePath, Buffer.from(arrayBuf));

      // Rewrite the markdown reference to the local path
      const localPath = `assets/${slug}/${filename}`;
      replacements.set(full, `![${alt}](${localPath})`);
    } catch (err) {
      console.warn(
        `[downloadImages] Failed to download ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Keep the original URL on failure
    }
  }

  // Apply replacements
  let result = markdown;
  for (const [original, replacement] of replacements) {
    result = result.replace(original, replacement);
  }

  return result;
}
