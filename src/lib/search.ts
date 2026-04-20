import fs from "fs/promises";
import path from "path";
import type { IndexEntry } from "./types";
import { callLLM, hasLLMKey } from "./llm";
import { withFileLock } from "./lock";
import { hasLinkTo } from "./links";
import { parseFrontmatter } from "./frontmatter";
import {
  getWikiDir,
  readWikiPage,
  writeWikiPage,
  listWikiPages,
  withPageCache,
} from "./wiki";
import { isEnoent } from "./errors";

// ---------------------------------------------------------------------------
// Cross-referencing helpers
// ---------------------------------------------------------------------------

const RELATED_PAGES_PROMPT = `Given this new wiki page and the existing wiki index, return a JSON array of slugs for pages that are related and should cross-reference this new page. Return at most 5 slugs. Return only the JSON array, nothing else.`;

/**
 * Identify existing wiki pages that are related to a newly written page.
 *
 * Sends the index entries + a summary of the new content to the LLM and asks
 * it to return a JSON array of related slugs. Falls back to an empty array
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
  } catch (err) {
    console.warn("[wiki] findRelatedPages LLM call failed:", err);
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
  return withFileLock("cross-ref", async () => {
    const updatedSlugs: string[] = [];

    for (const slug of relatedSlugs) {
      const page = await readWikiPage(slug);
      if (!page) continue;

      // Skip if already links to the new page (use proper link detection
      // rather than substring matching to avoid false positives when the slug
      // appears in prose without being a wiki link).
      if (hasLinkTo(page.content, newSlug)) continue;

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
  });
}

// ---------------------------------------------------------------------------
// Backlinks — "What links here"
// ---------------------------------------------------------------------------

/**
 * Find all wiki pages that link to the given slug.
 * Returns an array of { slug, title } for pages containing a markdown link
 * to `targetSlug.md`.
 */
export async function findBacklinks(
  targetSlug: string,
): Promise<Array<{ slug: string; title: string }>> {
  return withPageCache(async () => {
    const pages = await listWikiPages();
    const backlinks: Array<{ slug: string; title: string }> = [];

    for (const page of pages) {
      if (page.slug === targetSlug || page.slug === "index" || page.slug === "log")
        continue;
      const wikiPage = await readWikiPage(page.slug);
      if (wikiPage && hasLinkTo(wikiPage.content, targetSlug)) {
        backlinks.push({ slug: page.slug, title: page.title });
      }
    }

    return backlinks;
  });
}

// ---------------------------------------------------------------------------
// Full-text content search
// ---------------------------------------------------------------------------

/** A search result with snippet context. */
export interface ContentSearchResult {
  slug: string;
  title: string;
  summary: string;
  /** Short snippet showing the match context */
  snippet: string;
}

/**
 * Search wiki page content for a query string.
 *
 * Simple case-insensitive term matching across all wiki pages.
 * Designed for the real-time search bar — uses OR semantics (any term matches)
 * and scores by number of matching terms.
 */
export async function searchWikiContent(
  query: string,
  maxResults = 10,
): Promise<ContentSearchResult[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [];

  const wikiDir = getWikiDir();
  let files: string[];
  try {
    files = await fs.readdir(wikiDir);
  } catch (err) {
    if (!isEnoent(err)) {
      console.warn("[wiki] searchWikiContent failed to read wiki directory:", err);
    }
    return [];
  }

  const SKIP = new Set(["index.md", "log.md"]);

  const scored: Array<{
    slug: string;
    title: string;
    summary: string;
    snippet: string;
    score: number;
  }> = [];

  for (const file of files) {
    if (!file.endsWith(".md") || SKIP.has(file)) continue;
    const slug = file.replace(/\.md$/, "");

    let content: string;
    try {
      content = await fs.readFile(path.join(wikiDir, file), "utf-8");
    } catch (err) {
      console.warn(`[wiki] searchWikiContent failed to read "${file}":`, err);
      continue;
    }

    const lower = content.toLowerCase();

    // Count how many query terms appear
    let score = 0;
    let firstMatchIndex = -1;
    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx !== -1) {
        score++;
        if (firstMatchIndex === -1 || idx < firstMatchIndex) {
          firstMatchIndex = idx;
        }
      }
    }

    if (score === 0) continue;

    // Extract title from first heading or slug
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    // Extract summary from index-style content (first paragraph after heading)
    const parsed = parseFrontmatter(content);
    const body = parsed.body;
    const summaryLine = body
      .replace(/^#\s+.+$/m, "")
      .trim()
      .split("\n")
      .find((l) => l.trim().length > 0);
    const summary = summaryLine
      ? summaryLine.trim().slice(0, 120) + (summaryLine.length > 120 ? "…" : "")
      : "";

    // Build a snippet around the first match
    const snippetRadius = 60;
    const start = Math.max(0, firstMatchIndex - snippetRadius);
    const end = Math.min(content.length, firstMatchIndex + snippetRadius);
    let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < content.length) snippet = snippet + "…";

    scored.push({ slug, title, summary, snippet, score });
  }

  // Sort by score descending, then alphabetically by title
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return scored.slice(0, maxResults);
}
