/**
 * HTML parsing and conversion utilities.
 *
 * Extracted from fetch.ts — contains all HTML-to-text and HTML-to-markdown
 * conversion logic, plus Readability-based article extraction.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities to their plain-text equivalents.
 * Shared between `stripHtml` and `htmlToMarkdown`.
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

// ---------------------------------------------------------------------------
// stripHtml — regex-based HTML to plain text
// ---------------------------------------------------------------------------

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
// htmlToMarkdown — lightweight HTML → Markdown converter
// ---------------------------------------------------------------------------

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

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode entities in any remaining raw text
  md = decodeEntities(md);

  // Collapse excessive blank lines (3+ → 2)
  md = md.replace(/\n{3,}/g, "\n\n");

  // Remove leading/trailing whitespace per line (but preserve blank lines)
  md = md
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  return md.trim();
}

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Readability-based article extraction
// ---------------------------------------------------------------------------

/**
 * Extract article content from HTML using @mozilla/readability + linkedom.
 * Returns `null` when Readability cannot identify an article in the page.
 *
 * Returns both `textContent` (plain text, for backward compat) and
 * `htmlContent` (sanitised HTML that Readability produces, which preserves
 * images, links, and formatting).
 */
/**
 * Salvage plausible *content* image URLs from raw HTML — a generic fallback for
 * figures Readability drops (lazy-loaded, empty-alt, `<picture>`/`<source>`, SVG
 * diagrams). Parses with linkedom (the same DOM lib Readability uses here) rather
 * than regex, so it's robust to attribute order/quoting on any site.
 *
 * Each candidate is resolved against `baseUrl` (so relative `/images/x.png`
 * become absolute) and image-proxy URLs are unwrapped to their real target —
 * e.g. Next.js `/_next/image?url=<encoded CDN url>&w=…` → the CDN url. Many
 * modern sites (Anthropic's blog included) serve every figure through that
 * proxy, so without unwrapping virtually all diagrams are missed. Strips chrome
 * (nav/header/footer/aside) so we don't grab logos/sprites, skips data URIs +
 * icon/logo/avatar URLs + tiny declared sizes, and dedupes. Capped at `max`.
 */
export function extractImageUrls(
  html: string,
  baseUrl?: string,
  max = 12,
): string[] {
  let document: ReturnType<typeof parseHTML>["document"];
  try {
    document = parseHTML(html).document;
  } catch (err) {
    logger.warn("ingest", "extractImageUrls parse failed:", err);
    return [];
  }
  document
    .querySelectorAll("script,style,nav,header,footer,noscript,aside")
    .forEach((el) => el.remove());

  // Resolve a raw src/srcset URL to an absolute http(s) target, unwrapping a
  // common image-proxy `?url=<encoded absolute>` param when present.
  const resolve = (raw?: string | null): string | null => {
    const v = raw?.trim();
    if (!v) return null;
    try {
      const abs = baseUrl ? new URL(v, baseUrl) : new URL(v);
      const proxied = abs.searchParams.get("url");
      if (proxied && /^https?:\/\//i.test(proxied)) return proxied;
      return /^https?:$/i.test(abs.protocol) ? abs.href : null;
    } catch {
      return null;
    }
  };

  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string | null) => {
    const url = resolve(raw);
    if (!url) return;
    if (/(logo|sprite|icon|favicon|avatar|emoji)/i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  const firstSrcset = (s: string | null) =>
    s?.split(",")[0]?.trim().split(/\s+/)[0] ?? null;

  for (const img of Array.from(document.querySelectorAll("img"))) {
    if (urls.length >= max) break;
    const w = Number(img.getAttribute("width"));
    const h = Number(img.getAttribute("height"));
    if ((w && w < 80) || (h && h < 80)) continue; // icon-sized
    push(img.getAttribute("src") || img.getAttribute("data-src"));
    push(firstSrcset(img.getAttribute("srcset")));
  }
  for (const source of Array.from(
    document.querySelectorAll("picture source, figure source"),
  )) {
    if (urls.length >= max) break;
    push(firstSrcset(source.getAttribute("srcset")));
  }
  return urls.slice(0, max);
}

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
    logger.warn("ingest", "Readability extraction failed:", err);
    return null;
  }
}
