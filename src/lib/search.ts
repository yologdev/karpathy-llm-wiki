import fs from "fs/promises";
import path from "path";
import type { IndexEntry } from "./types";
import { callLLM, hasLLMKey } from "./llm";
import { withFileLock } from "./lock";
import { hasLinkTo } from "./links";
import { parseFrontmatter } from "./frontmatter";
import { logger } from "./logger";
import {
  getWikiDir,
  readWikiPage,
  writeWikiPage,
  listWikiPages,
  withPageCache,
} from "./wiki";
import { isEnoent } from "./errors";
import { getAgent } from "./agents";

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
    logger.warn("wiki", "findRelatedPages LLM call failed:", err);
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
  /** True when this result came from fuzzy (typo-tolerant) matching */
  fuzzy?: boolean;
}

/**
 * Scope filter for search — restricts results to a set of known slugs.
 * The caller resolves agent IDs (or other scope sources) to slug lists
 * before calling search, keeping search.ts decoupled from agents.ts.
 */
export interface SearchScope {
  agentId: string;
  slugs: string[];
}

// ---------------------------------------------------------------------------
// Fuzzy matching — Levenshtein-based typo tolerance
// ---------------------------------------------------------------------------

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses a simple iterative two-row approach — no dependencies.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix for O(n) space
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Get the maximum allowed edit distance for a word based on its length.
 * - Words ≤ 2 chars: 0 (exact only)
 * - Words 3–4 chars: 1
 * - Words ≥ 5 chars: 2
 */
function maxDistanceForWord(word: string): number {
  if (word.length <= 2) return 0;
  if (word.length <= 4) return 1;
  return 2;
}

/**
 * Check if a query fuzzy-matches the given text.
 *
 * For each word in the query, checks if any word in the text is within
 * the allowed edit distance. All query words must match for the overall
 * result to be true.
 *
 * @param query - The search query (may contain multiple words)
 * @param text - The text to search in
 * @param maxDistance - Override the per-word distance threshold (optional)
 * @returns true if every query word fuzzy-matches at least one text word
 */
export function fuzzyMatch(
  query: string,
  text: string,
  maxDistance?: number,
): boolean {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const textWords = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (queryWords.length === 0) return false;
  if (textWords.length === 0) return false;

  for (const qw of queryWords) {
    const threshold = maxDistance ?? maxDistanceForWord(qw);
    // If threshold is 0, we need exact match
    if (threshold === 0) {
      if (!textWords.some((tw) => tw === qw)) return false;
    } else {
      if (!textWords.some((tw) => levenshteinDistance(qw, tw) <= threshold)) return false;
    }
  }

  return true;
}

/**
 * Search wiki page content for a query string.
 *
 * Simple case-insensitive term matching across all wiki pages.
 * Designed for the real-time search bar — uses OR semantics (any term matches)
 * and scores by number of matching terms.
 *
 * When `scope` is provided, only pages whose slug appears in `scope.slugs`
 * are searched.
 */
export async function searchWikiContent(
  query: string,
  maxResults = 10,
  scope?: SearchScope,
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
      logger.warn("wiki", "searchWikiContent failed to read wiki directory:", err);
    }
    return [];
  }

  const SKIP = new Set(["index.md", "log.md"]);
  const scopeSlugs = scope ? new Set(scope.slugs) : null;

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

    // Scope filtering: skip pages not in the scope's slug set
    if (scopeSlugs && !scopeSlugs.has(slug)) continue;

    let content: string;
    try {
      content = await fs.readFile(path.join(wikiDir, file), "utf-8");
    } catch (err) {
      logger.warn("wiki", `searchWikiContent failed to read "${file}":`, err);
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

// ---------------------------------------------------------------------------
// Fuzzy content search — falls back to fuzzy when exact returns few results
// ---------------------------------------------------------------------------

/** Minimum exact results before fuzzy fallback kicks in */
const FUZZY_FALLBACK_THRESHOLD = 3;

/**
 * Search wiki page content, falling back to fuzzy matching when exact
 * matching returns fewer than 3 results.
 *
 * Exact matches are returned first (without the fuzzy flag). Fuzzy matches
 * are appended after with `fuzzy: true`. Duplicates are removed.
 *
 * When `scope` is provided, only pages whose slug appears in `scope.slugs`
 * are searched (both exact and fuzzy phases).
 */
export async function fuzzySearchWikiContent(
  query: string,
  maxResults = 10,
  scope?: SearchScope,
): Promise<ContentSearchResult[]> {
  // Start with exact search
  const exactResults = await searchWikiContent(query, maxResults, scope);

  // If we have enough exact results, just return them
  if (exactResults.length >= FUZZY_FALLBACK_THRESHOLD) {
    return exactResults;
  }

  // Fall back to fuzzy matching for additional results
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return exactResults;

  // Don't bother with fuzzy if all terms are too short
  if (terms.every((t) => t.length <= 2)) return exactResults;

  const wikiDir = getWikiDir();
  let files: string[];
  try {
    files = await fs.readdir(wikiDir);
  } catch (err) {
    if (!isEnoent(err)) {
      logger.warn("wiki", "fuzzySearchWikiContent failed to read wiki directory:", err);
    }
    return exactResults;
  }

  const SKIP = new Set(["index.md", "log.md"]);
  const exactSlugs = new Set(exactResults.map((r) => r.slug));
  const scopeSlugs = scope ? new Set(scope.slugs) : null;

  const fuzzyResults: ContentSearchResult[] = [];

  for (const file of files) {
    if (!file.endsWith(".md") || SKIP.has(file)) continue;
    const slug = file.replace(/\.md$/, "");

    // Scope filtering: skip pages not in the scope's slug set
    if (scopeSlugs && !scopeSlugs.has(slug)) continue;

    // Skip pages already in exact results
    if (exactSlugs.has(slug)) continue;

    let content: string;
    try {
      content = await fs.readFile(path.join(wikiDir, file), "utf-8");
    } catch (err) {
      if (!isEnoent(err)) {
        logger.warn("search", `unexpected error reading wiki file "${file}":`, err);
      }
      continue;
    }

    if (!fuzzyMatch(query, content)) continue;

    // Extract title from first heading or slug
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    // Extract summary
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

    // For fuzzy results, use the beginning of the page as snippet
    const snippetText = body
      .replace(/^#\s+.+$/m, "")
      .trim()
      .slice(0, 120)
      .replace(/\n/g, " ")
      .trim();
    const snippet = snippetText + (snippetText.length >= 120 ? "…" : "");

    fuzzyResults.push({ slug, title, summary, snippet, fuzzy: true });
  }

  // Sort fuzzy results alphabetically by title
  fuzzyResults.sort((a, b) => a.title.localeCompare(b.title));

  // Combine: exact first, then fuzzy to fill up to maxResults
  const remaining = maxResults - exactResults.length;
  return [...exactResults, ...fuzzyResults.slice(0, remaining)];
}

// ---------------------------------------------------------------------------
// Scope resolution — parse a scope string and resolve to a SearchScope
// ---------------------------------------------------------------------------

/**
 * Parse a scope parameter string and resolve it to a {@link SearchScope}.
 *
 * Currently supports:
 *   - `"agent:<id>"` — looks up the agent via {@link getAgent} and returns all
 *     page slugs from `identityPages + learningPages + socialPages`.
 *
 * Returns `null` if the scope string format is invalid or the referenced
 * entity doesn't exist.
 */
export async function resolveScope(
  scopeParam: string,
): Promise<SearchScope | null> {
  if (!scopeParam || typeof scopeParam !== "string") return null;

  const match = scopeParam.match(/^agent:(.+)$/);
  if (!match) return null;

  const agentId = match[1];
  if (!agentId) return null;

  try {
    const agent = await getAgent(agentId);
    if (!agent) return null;

    const slugs = [
      ...(agent.identityPages ?? []),
      ...(agent.learningPages ?? []),
      ...(agent.socialPages ?? []),
    ];

    return { agentId: agent.id, slugs };
  } catch {
    // Invalid agent ID format or other error — treat as unresolvable
    return null;
  }
}
