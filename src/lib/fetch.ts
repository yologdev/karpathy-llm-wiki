/**
 * URL fetching and image downloading.
 *
 * This module is the main entry point for URL-related operations. It also
 * re-exports HTML parsing and URL safety utilities from their dedicated
 * modules for backwards compatibility — existing imports from "./fetch" or
 * "@/lib/fetch" continue to work unchanged.
 */

import path from "path";
import {
  MAX_RESPONSE_SIZE,
  MAX_CONTENT_LENGTH,
  FETCH_TIMEOUT_MS,
  MAX_IMAGES_PER_SOURCE,
  MAX_PDF_SIZE,
} from "./constants";
import { logger } from "./logger";
import {
  stripHtml,
  htmlToMarkdown,
  extractTitle,
  extractWithReadability,
  extractImageUrls,
} from "./html-parse";
import { validateUrlSafety } from "./url-safety";
import { getStorage } from "./storage";
import { rawRelPath } from "./wiki";
import { ClientInputError, getErrorMessage } from "./errors";

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
// (e.g. image/png) is rejected early to avoid feeding binary garbage into the
// HTML-parsing pipeline. PDFs are handled via a dedicated extraction path.
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/xml",
  "text/xml",
  "application/pdf",
];

/**
 * Extract a PDF's text WITH layout structure preserved.
 *
 * unpdf's `extractText` flattens every text item into a single space-joined run
 * (no line breaks), turning a long PDF into one unreadable wall — bad for the
 * human "View raw" surface and weaker as synthesis input. Instead we read
 * pdf.js' per-item text and use each item's `hasEOL` flag to rebuild lines, with
 * a blank line between pages. Falls back to `extractText` when the structured
 * API isn't available (e.g. a stubbed doc) or yields nothing. Shared by the URL
 * and upload PDF paths. Uses a dynamic import to avoid the ~1.6 MB pdf.js bundle
 * on every request.
 */
export async function pdfToText(buffer: ArrayBuffer): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  try {
    try {
      if (typeof doc.getPage === "function" && doc.numPages > 0) {
        const pages: string[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const content = await page.getTextContent();
          const lines: string[] = [];
          let line = "";
          for (const item of content.items as Array<{
            str?: string;
            hasEOL?: boolean;
          }>) {
            if (typeof item.str !== "string") continue;
            line += item.str;
            if (item.hasEOL) {
              lines.push(line.trimEnd());
              line = "";
            }
          }
          if (line.trim()) lines.push(line.trimEnd());
          pages.push(lines.join("\n"));
        }
        const structured = pages.join("\n\n").trim();
        if (structured) return structured;
      }
    } catch {
      // Structured extraction unavailable/failed — fall through to flat text.
    }
    const { text } = await extractText(doc, { mergePages: false });
    return (Array.isArray(text) ? text.join("\n\n") : text).trim();
  } finally {
    await doc.cleanup();
  }
}

async function extractPdfText(
  buffer: ArrayBuffer,
  fallbackTitle: string,
): Promise<{ title: string; content: string }> {
  const trimmed = (await pdfToText(buffer)).trim();
  if (!trimmed) {
    throw new ClientInputError(
      "PDF has no extractable text layer. Scanned/image-only PDFs are not supported yet.",
    );
  }

  // Title from the first non-empty line (often the document title).
  const firstLine =
    trimmed.split("\n").find((l) => l.trim().length > 0)?.trim() ??
    fallbackTitle;
  const title = firstLine.length > 200 ? firstLine.slice(0, 200) : firstLine;

  const content =
    trimmed.length > MAX_CONTENT_LENGTH
      ? trimmed.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]"
      : trimmed;

  return { title: title || fallbackTitle, content };
}

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

  // ---------- PDF: read as binary, extract text via unpdf ----------
  if (mimeType === "application/pdf") {
    const declared = Number(response.headers.get("Content-Length") ?? 0);
    if (declared > MAX_PDF_SIZE) {
      throw new ClientInputError(
        `PDF too large (${(declared / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_PDF_SIZE / 1024 / 1024} MB.`,
      );
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PDF_SIZE) {
      throw new ClientInputError(
        `PDF too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_PDF_SIZE / 1024 / 1024} MB.`,
      );
    }
    return extractPdfText(
      buffer,
      new URL(url).pathname.split("/").pop()?.replace(/\.pdf$/i, "") ??
        "PDF Document",
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

  // Readability prunes figures that look decorative (lazy-loaded, empty alt, SVG
  // diagrams), so technical posts often lose their diagrams. Salvage image URLs
  // straight from the source DOM and reference any the extracted content is
  // missing — downloadImages() then localizes them (or keeps the URL). Appended
  // AFTER truncation so a long article never drops its figures. HTML path only.
  if (mimeType !== "text/plain" && mimeType !== "text/markdown") {
    const salvaged = extractImageUrls(body, url).filter(
      (u) => !content.includes(u),
    );
    if (salvaged.length > 0) {
      content += "\n\n" + salvaged.map((u) => `![](${u})`).join("\n\n");
    }
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
 * Download images referenced in markdown content and store them via
 * the storage provider. Rewrites image URLs in the markdown to point
 * to local paths.
 *
 * @param markdown - Markdown content with `![alt](url)` image references
 * @param slug - The source slug (used to namespace image files)
 * @param _rawDir - Unused (kept for API compatibility); assets are stored
 *                  via `rawRelPath("assets/<slug>/<filename>")`
 * @returns The markdown with rewritten image URLs
 */
export async function downloadImages(
  markdown: string,
  slug: string,
  _rawDir: string,
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

  const storage = getStorage();

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

      // Write via storage provider using relative path
      const storagePath = rawRelPath(`assets/${slug}/${filename}`);
      await storage.writeAsset(storagePath, arrayBuf);

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

/**
 * Fetch a single image by URL and store it as an asset under
 * `assets/<slug>/<filename>`. Used by the image-ingest flow.
 *
 * Unlike {@link downloadImages} (which degrades gracefully across many embedded
 * images), this **throws** on hard failures (unsafe URL, non-image, oversized,
 * fetch error) so the calling route can return a clear client error — the user
 * gave us a single URL and expects feedback if it's bad.
 *
 * @returns the local markdown ref, the raw bytes (for the vision model), the
 *          filename, and the content type.
 */
/**
 * Fetch an image by URL and validate it WITHOUT storing it yet (so the caller
 * can run vision and pick a slug before the asset path is fixed). Throws a
 * {@link ClientInputError} on unsafe/non-image/oversized input (→ 4xx).
 */
export async function fetchImageBytes(
  url: string,
): Promise<{ bytes: ArrayBuffer; filename: string; contentType: string }> {
  try {
    validateUrlSafety(url); // SSRF guard — throws on private/unsafe hosts
  } catch (err) {
    throw new ClientInputError(getErrorMessage(err));
  }

  const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) {
    throw new ClientInputError(`Failed to fetch image: HTTP ${resp.status}`);
  }
  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new ClientInputError(
      `URL is not an image (content-type: ${contentType || "unknown"})`,
    );
  }
  const bytes = await resp.arrayBuffer();
  if (bytes.byteLength > MAX_RESPONSE_SIZE) {
    throw new ClientInputError(
      `Image too large (${bytes.byteLength} bytes, max ${MAX_RESPONSE_SIZE})`,
    );
  }
  return { bytes, filename: sanitizeImageFilename(url), contentType };
}

export async function storeImageAsset(
  url: string,
  slug: string,
): Promise<{ localPath: string; bytes: ArrayBuffer; filename: string; contentType: string }> {
  const { bytes, filename, contentType } = await fetchImageBytes(url);
  const { localPath } = await storeImageBytes(bytes, slug, filename);
  return { localPath, bytes, filename, contentType };
}

/**
 * Store raw image bytes (e.g. an uploaded file) as an asset under
 * `assets/<slug>/<filename>`. `suggestedName` may be a URL or a plain filename;
 * it's sanitized. Enforces {@link MAX_RESPONSE_SIZE}.
 */
export async function storeImageBytes(
  bytes: ArrayBuffer,
  slug: string,
  suggestedName: string,
): Promise<{ localPath: string; filename: string }> {
  if (bytes.byteLength > MAX_RESPONSE_SIZE) {
    throw new ClientInputError(
      `Image too large (${bytes.byteLength} bytes, max ${MAX_RESPONSE_SIZE})`,
    );
  }
  const filename = sanitizeImageFilename(suggestedName);
  const localPath = `assets/${slug}/${filename}`;
  await getStorage().writeAsset(rawRelPath(localPath), bytes);
  return { localPath, filename };
}
