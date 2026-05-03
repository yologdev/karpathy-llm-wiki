import { callLLM, hasLLMKey } from "./llm";
import {
  listWikiPages,
  writeWikiPageWithSideEffects,
  withPageCache,
} from "./wiki";
import { slugify } from "./slugify";
import { extractSummary } from "./ingest";
import { loadPageConventions } from "./schema";
import { serializeFrontmatter } from "./frontmatter";
import {
  buildCorpusStats,
  bm25Score,
  type CorpusStats,
} from "./bm25";
import { extractCitedSlugs } from "./citations";
import type { QueryResult } from "./types";

import {
  selectPagesForQuery,
  buildContext,
} from "./query-search";

import { resolveScope } from "./search";

// Re-export BM25 helpers so existing callers (and tests) that import them
// from `./query` continue to work after the bm25 extraction.
export { buildCorpusStats, bm25Score };
export type { CorpusStats };

// Re-export search/ranking helpers from query-search.ts for backwards
// compatibility — callers that import from "./query" continue to work.
export {
  extractBestSnippet,
  reciprocalRankFusion,
  searchIndex,
  buildContext,
  selectPagesForQuery,
} from "./query-search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_TEMPLATE = `You are a wiki assistant. Answer the user's question using ONLY the wiki pages provided below.

Rules:
- Base your answer strictly on the wiki content provided
- Cite your sources using markdown links: [Page Title](slug.md)
- If the wiki doesn't contain enough information to answer, say so clearly
- Format your answer in markdown
{index_section}
Wiki pages:
{context}`;

/**
 * Extra system-prompt instruction appended when the caller requests a
 * table-formatted answer. Kept as a top-level constant so tests can assert on
 * its presence without duplicating the string.
 */
export const TABLE_FORMAT_INSTRUCTION =
  "Format your answer as a markdown comparison table where possible. Include a short prose lead-in (1-2 sentences) before the table. Every column header should be meaningful. Cite sources as [[slug]] in a final 'Sources' row or paragraph.";

/**
 * Extra system-prompt instruction appended when the caller requests a
 * Marp slide deck answer format.
 */
export const SLIDES_FORMAT_INSTRUCTION = `Format your answer as a Marp slide deck. Use \`---\` to separate slides.
The first slide should be a title slide with \`# {question}\`.
Each subsequent slide should cover one key point with a heading and 2-4 bullet points.
Keep slides concise — aim for 5-8 slides total.
Include a final "Sources" slide citing wiki pages as [[slug]].
Use standard Marp markdown (no custom directives needed).
Start the response with the Marp front matter:
---
marp: true
---`;

/** Answer format hint supported by `query()` / `buildQuerySystemPrompt()`. */
export type QueryFormat = "prose" | "table" | "slides";

// ---------------------------------------------------------------------------
// BM25 sparse index search
// ---------------------------------------------------------------------------
//
// Tokenization, corpus-stat construction, and BM25 scoring live in
// `./bm25`. They are re-exported at the top of this file for backwards
// compatibility with callers that still import them from `./query`.

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

// Re-export extractCitedSlugs from the shared citations module so existing
// consumers that import from "./query" continue to work.
export { extractCitedSlugs };

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt used for wiki queries.
 *
 * Exported so the streaming endpoint can reuse the same prompt construction
 * without duplicating logic.
 */
export async function buildQuerySystemPrompt(
  context: string,
  entries: { slug: string; title: string; summary: string }[],
  selectedSlugs: string[],
  format: QueryFormat = "prose",
): Promise<string> {
  // Build the full index listing so the LLM knows what else exists
  const indexListing = entries
    .map((e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`)
    .join("\n");

  const indexSection =
    entries.length > selectedSlugs.length
      ? `\nThe wiki also contains these other pages (not loaded in full):\n${indexListing}\n`
      : "";

  let systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace("{context}", context)
    .replace("{index_section}", indexSection);

  // Append SCHEMA.md conventions so the query prompt stays in sync with the
  // wiki's page conventions — same pattern used by ingest.
  const conventions = await loadPageConventions();
  if (conventions) {
    systemPrompt += `\n\nThe wiki you are querying follows these conventions (from SCHEMA.md):\n\n${conventions}`;
  }

  // Append format-specific instructions. Prose is the default and adds
  // nothing, so existing callers see identical output.
  if (format === "table") {
    systemPrompt += `\n\n${TABLE_FORMAT_INSTRUCTION}`;
  } else if (format === "slides") {
    systemPrompt += `\n\n${SLIDES_FORMAT_INSTRUCTION}`;
  }

  return systemPrompt;
}

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

/**
 * Query the wiki with a user question.
 *
 * Index-first approach: reads the index to find relevant pages, then loads
 * only those pages for context. For small wikis (<= 5 pages), loads all.
 *
 * The optional `format` controls how the LLM is asked to shape its answer.
 * `"prose"` (the default) is the current free-form markdown behavior;
 * `"table"` adds a system-prompt hint asking for a markdown comparison table;
 * `"slides"` asks for a Marp slide deck.
 *
 * The optional `scope` filters search to a subset of pages (e.g.
 * `"agent:yoyo"` limits to that agent's pages).
 */
export async function query(
  question: string,
  format: QueryFormat = "prose",
  scope?: string,
): Promise<QueryResult> {
  return withPageCache(async () => {
    const entries = await listWikiPages();

    // Resolve scope to a set of slugs when provided
    let scopeSlugs: string[] | undefined;
    if (scope) {
      const resolved = await resolveScope(scope);
      if (!resolved) {
        return {
          answer: `Invalid scope or agent not found: '${scope}'`,
          sources: [],
        };
      }
      scopeSlugs = resolved.slugs;
      if (scopeSlugs.length === 0) {
        return {
          answer: `No pages found for scope '${scope}'`,
          sources: [],
        };
      }
    }

    // Empty wiki — nothing to query
    if (entries.length === 0) {
      return {
        answer:
          "The wiki is empty. Please [ingest some content](/ingest) first so I have something to answer from.",
        sources: [],
      };
    }

    // Determine which pages to load
    const selectedSlugs = await selectPagesForQuery(question, entries, scopeSlugs);

    const { context } = await buildContext(selectedSlugs);

    // No API key — return a helpful fallback
    if (!hasLLMKey()) {
      const allSlugs = entries.map((e) => e.slug);
      const pageList = allSlugs.map((s) => `- ${s}`).join("\n");
      return {
        answer: `**No API key configured.** Set an API key (\`ANTHROPIC_API_KEY\`, \`OPENAI_API_KEY\`, etc.) to enable querying.\n\nYour wiki currently contains these pages:\n${pageList}`,
        sources: [],
      };
    }

    const systemPrompt = await buildQuerySystemPrompt(
      context,
      entries,
      selectedSlugs,
      format,
    );

    const answer = await callLLM(systemPrompt, question);

    // All slugs in the wiki are valid citation targets
    const allSlugs = entries.map((e) => e.slug);
    const sources = extractCitedSlugs(answer, allSlugs);

    return { answer, sources };
  });
}

// ---------------------------------------------------------------------------
// Save answer to wiki
// ---------------------------------------------------------------------------

/**
 * Save a query answer as a new wiki page.
 *
 * Unlike the full `ingest()` pipeline, this writes the answer markdown
 * directly — it's already a well-formatted page with citations. The actual
 * write/index/cross-ref/log dance is delegated to
 * {@link writeWikiPageWithSideEffects} so this path can never drift from
 * `ingest()` again (see `.yoyo/learnings.md` — "Parallel write-paths drift").
 *
 * Returns the slug of the newly created wiki page.
 */
export async function saveAnswerToWiki(
  title: string,
  content: string,
): Promise<{ slug: string }> {
  const slug = slugify(title);

  if (!slug) {
    throw new Error("Title must produce a valid slug");
  }

  // Prepend a heading if the content doesn't already start with one
  const pageContent = content.trimStart().startsWith("# ")
    ? content
    : `# ${title}\n\n${content}`;

  // Extract a short summary from the content (first sentence or first 200 chars)
  const plainContent = content.replace(/^#.*$/gm, "").trim();
  const summary = extractSummary(plainContent) || title;

  // Wrap in YAML frontmatter so saved answers have the same metadata as
  // ingested pages (created/updated dates, source type, tags).
  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const contentWithFm = serializeFrontmatter(
    {
      created: now,
      updated: now,
      source: "query",
      tags: ["query-answer"],
    },
    pageContent,
  );

  // Hand off to the unified write pipeline. We pass the original answer
  // `content` (rather than `pageContent`) as the cross-ref source so the
  // related-pages prompt sees the same text the user actually saw.
  const { slug: writtenSlug } = await writeWikiPageWithSideEffects({
    slug,
    title,
    content: contentWithFm,
    summary,
    logOp: "save",
    crossRefSource: content,
    logDetails: ({ updatedSlugs }) =>
      `query answer saved as ${slug} · linked ${updatedSlugs.length} related page(s)`,
  });

  return { slug: writtenSlug };
}
