import {
  saveRawSource,
  readWikiPage,
  writeWikiPage,
  listWikiPages,
  updateIndex,
  appendToLog,
} from "./wiki";
import { callLLM, hasLLMKey } from "./llm";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { IngestResult, IndexEntry } from "./types";

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/** Convert a title into a URL-safe slug (lowercase, hyphens, no special chars). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
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

/** Maximum response body size in bytes (5 MB). */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/** Maximum extracted text content length passed downstream (100 K chars). */
const MAX_CONTENT_LENGTH = 100_000;

/** Fetch timeout in milliseconds (15 seconds). */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Extract article content from HTML using @mozilla/readability + linkedom.
 * Returns `null` when Readability cannot identify an article in the page.
 */
export function extractWithReadability(
  html: string,
): { title: string; textContent: string } | null {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 0) {
      return {
        title: article.title || "",
        textContent: article.textContent.trim(),
      };
    }
    return null;
  } catch {
    // If linkedom/Readability throws, fall back to regex stripping
    return null;
  }
}

/**
 * Fetch a URL and extract its text content and title.
 *
 * Uses @mozilla/readability + linkedom for robust HTML-to-text extraction.
 * Falls back to regex-based `stripHtml()` when Readability can't parse the page.
 * Applies a 15-second timeout and a 5 MB response size limit for safety.
 */
export async function fetchUrlContent(
  url: string,
): Promise<{ title: string; content: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "llm-wiki/1.0",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`,
    );
  }

  // Check Content-Length header before reading body
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    throw new Error(
      `Content too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`,
    );
  }

  const html = await response.text();

  // Check actual body size after reading
  if (html.length > MAX_RESPONSE_SIZE) {
    throw new Error(
      `Content too large: ${html.length} chars (max ${MAX_RESPONSE_SIZE})`,
    );
  }

  let title: string;
  let content: string;

  // Try Readability first for proper article extraction
  const article = extractWithReadability(html);
  if (article) {
    title = article.title || extractTitle(html) || new URL(url).hostname;
    content = article.textContent;
  } else {
    // Fallback to regex-based stripping for non-article pages
    title = extractTitle(html) || new URL(url).hostname;
    content = stripHtml(html);
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

/**
 * Ingest a URL into the wiki.
 *
 * 1. Fetch and extract the page content
 * 2. Delegate to the standard `ingest()` pipeline
 */
export async function ingestUrl(url: string): Promise<IngestResult> {
  const { title, content } = await fetchUrlContent(url);
  return ingest(title, content);
}

// ---------------------------------------------------------------------------
// Fallback stub (no API key)
// ---------------------------------------------------------------------------

function generateFallbackPage(title: string, content: string): string {
  const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
  return `# ${title}\n\n## Summary\n\n${preview}\n\n## Raw Content\n\n${content}`;
}

// ---------------------------------------------------------------------------
// Summary extraction
// ---------------------------------------------------------------------------

/**
 * Extract a short summary from content by finding the first sentence.
 *
 * Uses sentence-ending punctuation followed by whitespace (`[.!?]\s`) or
 * paragraph breaks (`\n\n`) as boundaries — avoids splitting on abbreviations
 * like "Dr." or "U.S." where the period is not followed by a space that starts
 * a new sentence (though it's a heuristic, not perfect).
 *
 * Returns at most `maxLen` characters.
 */
export function extractSummary(content: string, maxLen = 200): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  // Look for a sentence boundary: period/exclamation/question followed by a space
  const sentenceEnd = trimmed.search(/[.!?]\s/);
  // Look for a paragraph break
  const paraBreak = trimmed.indexOf("\n\n");

  // Pick the earliest valid boundary
  let cutoff = -1;
  if (sentenceEnd !== -1 && paraBreak !== -1) {
    cutoff = Math.min(sentenceEnd + 1, paraBreak); // +1 to include the punctuation
  } else if (sentenceEnd !== -1) {
    cutoff = sentenceEnd + 1;
  } else if (paraBreak !== -1) {
    cutoff = paraBreak;
  }

  let summary: string;
  if (cutoff !== -1 && cutoff <= maxLen) {
    summary = trimmed.slice(0, cutoff).trim();
  } else {
    // No sentence boundary found or it's too far — just truncate
    summary =
      trimmed.length > maxLen
        ? trimmed.slice(0, maxLen).trim() + "..."
        : trimmed.trim();
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Cross-referencing
// ---------------------------------------------------------------------------

const RELATED_PAGES_PROMPT = `Given this new wiki page and the existing wiki index, return a JSON array of slugs for pages that are related and should cross-reference this new page. Return at most 5 slugs. Return only the JSON array, nothing else.`;

/**
 * Identify existing wiki pages that are related to a newly ingested page.
 *
 * Sends the index entries + a summary of the new content to the LLM and asks
 * it to return a JSON array of related slugs.  Falls back to an empty array
 * when there is no LLM key, no existing pages, or any error occurs.
 */
export async function findRelatedPages(
  newSlug: string,
  newContent: string,
  existingEntries: IndexEntry[],
): Promise<string[]> {
  // Nothing to cross-reference when there's no LLM or no existing pages
  if (!hasLLMKey() || existingEntries.length === 0) {
    return [];
  }

  // Build a user message with the index and the new page's content
  const indexList = existingEntries
    .filter((e) => e.slug !== newSlug)
    .map((e) => `- ${e.slug}: ${e.title} — ${e.summary}`)
    .join("\n");

  if (!indexList) {
    return [];
  }

  const userMessage = `## New page (slug: ${newSlug})\n\n${newContent.slice(0, 2000)}\n\n## Existing wiki index\n\n${indexList}`;

  try {
    const response = await callLLM(RELATED_PAGES_PROMPT, userMessage);

    // Extract JSON array from response — allow surrounding whitespace/text
    const match = response.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    // Validate: only keep slugs that actually exist in the index (and aren't the new page)
    const validSlugs = new Set(
      existingEntries.filter((e) => e.slug !== newSlug).map((e) => e.slug),
    );
    return parsed
      .filter((s): s is string => typeof s === "string" && validSlugs.has(s))
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Append cross-reference links to related wiki pages.
 *
 * For each related slug:
 * - Reads the existing wiki page
 * - Skips if it already contains a link to the new slug
 * - Appends a "See also" link (or extends an existing "See also" section)
 *
 * Returns the slugs that were actually modified.
 */
export async function updateRelatedPages(
  newSlug: string,
  newTitle: string,
  relatedSlugs: string[],
): Promise<string[]> {
  const updatedSlugs: string[] = [];

  for (const slug of relatedSlugs) {
    const page = await readWikiPage(slug);
    if (!page) continue;

    // Skip if already links to the new page
    if (page.content.includes(`${newSlug}.md`)) continue;

    const link = `[${newTitle}](${newSlug}.md)`;
    let updatedContent: string;

    // Check if there's already a "See also" section
    const seeAlsoPattern = /^(\*\*See also:\*\*.*)$/m;
    const seeAlsoMatch = page.content.match(seeAlsoPattern);

    if (seeAlsoMatch) {
      // Append to existing "See also" line
      updatedContent = page.content.replace(
        seeAlsoPattern,
        `${seeAlsoMatch[1]}, ${link}`,
      );
    } else {
      // Add a new "See also" section at the end
      updatedContent = `${page.content.trimEnd()}\n\n**See also:** ${link}\n`;
    }

    await writeWikiPage(slug, updatedContent);
    updatedSlugs.push(slug);
  }

  return updatedSlugs;
}

// ---------------------------------------------------------------------------
// Ingest pipeline
// ---------------------------------------------------------------------------

// Conventions are documented in SCHEMA.md at the repo root.
const SYSTEM_PROMPT = `You are a wiki editor. Given a source document, generate a wiki article in markdown format.

Include:
- A title as a level-1 heading (# Title)
- A brief summary section (## Summary)
- Key points or takeaways (## Key Points)
- Notable entities, concepts, or terms worth remembering (## Concepts)

Output pure markdown and nothing else. Do not wrap in code fences.`;

/**
 * Ingest a source document into the wiki.
 *
 * 1. Generate a slug from the title
 * 2. Save the raw source
 * 3. Generate a wiki page via LLM (or fallback stub)
 * 4. Write the wiki page
 * 5. Update the index (insert or update existing entry)
 * 6. Append to the log
 */
export async function ingest(
  title: string,
  content: string,
): Promise<IngestResult> {
  const slug = slugify(title);

  if (slug === "") {
    throw new Error(
      "Cannot ingest: title produces an empty slug",
    );
  }

  // 1. Save raw source
  const rawPath = await saveRawSource(slug, content);

  // 2. Generate wiki page content
  let wikiContent: string;
  if (hasLLMKey()) {
    wikiContent = await callLLM(SYSTEM_PROMPT, content);
  } else {
    wikiContent = generateFallbackPage(title, content);
  }

  // 3. Write wiki page
  await writeWikiPage(slug, wikiContent);

  // 4. Update index — insert new entry or update existing one
  const entries = await listWikiPages();
  const summary = extractSummary(content);
  const existingIdx = entries.findIndex((e) => e.slug === slug);
  if (existingIdx !== -1) {
    // Re-ingest: update title and summary of the existing entry
    entries[existingIdx].title = title;
    entries[existingIdx].summary = summary;
  } else {
    entries.push({ title, slug, summary });
  }
  await updateIndex(entries);

  // 5. Cross-reference related pages
  const updatedEntries = await listWikiPages(); // re-read after index update
  const relatedSlugs = await findRelatedPages(slug, content, updatedEntries);
  const updatedSlugs = await updateRelatedPages(slug, title, relatedSlugs);

  // 6. Log
  await appendToLog(
    "ingest",
    title,
    `slug: ${slug} · updated ${updatedSlugs.length} related page(s)`,
  );

  return {
    rawPath,
    wikiPages: [slug, ...updatedSlugs],
    indexUpdated: true,
  };
}
