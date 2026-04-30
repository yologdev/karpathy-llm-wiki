/**
 * URL fetching and image downloading.
 *
 * This module is the main entry point for URL-related operations. It also
 * re-exports HTML parsing and URL safety utilities from their dedicated
 * modules for backwards compatibility — existing imports from "./fetch" or
 * "@/lib/fetch" continue to work unchanged.
 */

import fs from "fs/promises";
import path from "path";
import {
  MAX_RESPONSE_SIZE,
  MAX_CONTENT_LENGTH,
  FETCH_TIMEOUT_MS,
  MAX_IMAGES_PER_SOURCE,
} from "./constants";
import { logger } from "./logger";
import {
  stripHtml,
  htmlToMarkdown,
  extractTitle,
  extractWithReadability,
} from "./html-parse";
import { validateUrlSafety } from "./url-safety";

// Re-export HTML parsing utilities for backwards compatibility
export { stripHtml, htmlToMarkdown, extractTitle, extractWithReadability } from "./html-parse";

// Re-export URL safety utilities for backwards compatibility
export { validateUrlSafety } from "./url-safety";

// ---------------------------------------------------------------------------
// URL detection
// ---------------------------------------------------------------------------

/** Check if a string looks like a URL (starts with http:// or https://). */
export function isUrl(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

// ---------------------------------------------------------------------------
// URL fetching
// ---------------------------------------------------------------------------

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
      logger.warn("fetch", "unexpected error parsing URL:", err);
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
        logger.warn("downloadImages", `HTTP ${resp.status} for ${url}, keeping original`);
        continue;
      }

      // Check content-type is an image
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        logger.warn("downloadImages", `Non-image content-type "${contentType}" for ${url}, keeping original`);
        continue;
      }

      const arrayBuf = await resp.arrayBuffer();
      // Respect MAX_RESPONSE_SIZE
      if (arrayBuf.byteLength > MAX_RESPONSE_SIZE) {
        logger.warn("downloadImages", `Image too large (${arrayBuf.byteLength} bytes) for ${url}, keeping original`);
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
      logger.warn(
        "downloadImages",
        `Failed to download ${url}: ${err instanceof Error ? err.message : String(err)}`,
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
