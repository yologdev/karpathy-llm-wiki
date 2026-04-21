import { callLLM, hasLLMKey } from "./llm";
import {
  listWikiPages,
  readWikiPage,
  writeWikiPageWithSideEffects,
  withPageCache,
} from "./wiki";
import { slugify, loadPageConventions, extractSummary } from "./ingest";
import { extractCitedSlugs } from "./citations";
import { searchByVector } from "./embeddings";
import { serializeFrontmatter } from "./frontmatter";
import {
  tokenize,
  buildCorpusStats,
  bm25Score,
  type CorpusStats,
} from "./bm25";
import type { IndexEntry, QueryResult } from "./types";
import {
  MAX_CONTEXT_PAGES,
  RRF_K,
} from "./constants";

// Re-export BM25 helpers so existing callers (and tests) that import them
// from `./query` continue to work after the bm25 extraction.
export { buildCorpusStats, bm25Score };
export type { CorpusStats };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** If the wiki has this many or fewer pages, load all of them (no filtering). */
const SMALL_WIKI_THRESHOLD = 5;

const SYSTEM_PROMPT_TEMPLATE = `You are a wiki assistant. Answer the user's question using ONLY the wiki pages provided below.

Rules:
- Base your answer strictly on the wiki content provided
- Cite your sources using markdown links: [Page Title](slug.md)
- If the wiki doesn't contain enough information to answer, say so clearly
- Format your answer in markdown
{index_section}
Wiki pages:
{context}`;

/** Maximum number of fusion candidates fed into the LLM re-ranking step. */
const RERANK_CANDIDATE_POOL = MAX_CONTEXT_PAGES * 2;

/** Maximum characters of page body included as a snippet for re-ranking. */
const RERANK_SNIPPET_CHARS = 500;

/**
 * Extra system-prompt instruction appended when the caller requests a
 * table-formatted answer. Kept as a top-level constant so tests can assert on
 * its presence without duplicating the string.
 */
export const TABLE_FORMAT_INSTRUCTION =
  "Format your answer as a markdown comparison table where possible. Include a short prose lead-in (1-2 sentences) before the table. Every column header should be meaningful. Cite sources as [[slug]] in a final 'Sources' row or paragraph.";

/** Answer format hint supported by `query()` / `buildQuerySystemPrompt()`. */
export type QueryFormat = "prose" | "table";

const RERANK_PROMPT = `You are a wiki search assistant. Given a user's question and a set of candidate wiki pages (with content snippets), re-rank them by relevance to the question.

Return ONLY a JSON array of slug strings, most relevant first. You may omit pages that are clearly irrelevant. Maximum {max} slugs.

Example response:
["machine-learning", "neural-networks", "backpropagation"]

Candidate pages:
{candidates}`;

// ---------------------------------------------------------------------------
// BM25 sparse index search
// ---------------------------------------------------------------------------
//
// Tokenization, corpus-stat construction, and BM25 scoring live in
// `./bm25`. They are re-exported at the top of this file for backwards
// compatibility with callers that still import them from `./query`.

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion (RRF)
// ---------------------------------------------------------------------------

/**
 * Combine two ranked result lists using Reciprocal Rank Fusion.
 *
 * For each slug appearing in either list, computes:
 *   `rrf_score = 1/(k + bm25_rank) + 1/(k + vector_rank)`
 *
 * where rank is the 1-based position and missing entries get rank = Infinity.
 * This avoids needing to normalize scores that live on different scales (BM25
 * vs cosine similarity).
 */
export function reciprocalRankFusion(
  bm25Results: Array<{ slug: string; score: number }>,
  vectorResults: Array<{ slug: string; score: number }>,
  k: number = RRF_K,
): Array<{ slug: string; score: number }> {
  // Build rank maps (1-based)
  const bm25Rank = new Map<string, number>();
  bm25Results.forEach((r, i) => bm25Rank.set(r.slug, i + 1));

  const vectorRank = new Map<string, number>();
  vectorResults.forEach((r, i) => vectorRank.set(r.slug, i + 1));

  // Collect all slugs from both lists
  const allSlugs = new Set([
    ...bm25Results.map((r) => r.slug),
    ...vectorResults.map((r) => r.slug),
  ]);

  const fused: Array<{ slug: string; score: number }> = [];
  for (const slug of allSlugs) {
    const br = bm25Rank.get(slug) ?? Infinity;
    const vr = vectorRank.get(slug) ?? Infinity;
    const rrfScore = 1 / (k + br) + 1 / (k + vr);
    fused.push({ slug, score: rrfScore });
  }

  fused.sort((a, b) => b.score - a.score);
  return fused;
}

/**
 * Search the wiki index to find the most relevant page slugs for a question.
 *
 * Phase 1: BM25 sparse scoring (always runs)
 * Phase 1b: Vector search (when an embedding provider is configured)
 * Phase 1c: RRF fusion of BM25 + vector results (when vector results exist)
 * Phase 2: LLM re-ranking of fusion candidates (if available) — sends
 *          candidate slugs with content snippets to the LLM for re-ordering,
 *          falls back to fusion ranking on failure.
 *
 * When `fullBody` is true (the default), BM25 indexes the full page content
 * from disk rather than just the title + summary from the index. This gives
 * much better recall for queries whose keywords only appear in the body.
 * Performance note: reads all pages from disk — fine for tens to low hundreds
 * of pages; vector search will replace this path later.
 */
export async function searchIndex(
  question: string,
  entries: IndexEntry[],
  fullBody: boolean = true,
): Promise<string[]> {
  if (entries.length === 0) {
    return [];
  }

  // Early return for empty/whitespace queries — BM25 would produce
  // meaningless zero-scores for every document.
  if (!question.trim()) {
    return [];
  }

  // Phase 1 — BM25 sparse scoring
  const questionTokens = tokenize(question);
  const corpusStats = await buildCorpusStats(entries, { fullBody });

  const bm25Results = entries
    .map((entry) => ({
      slug: entry.slug,
      score: bm25Score(entry, questionTokens, corpusStats),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_PAGES * 2); // Keep more candidates for fusion

  // Phase 1b — Vector search (if an embedding provider is configured)
  let vectorResults: Array<{ slug: string; score: number }> = [];
  try {
    vectorResults = await searchByVector(question, MAX_CONTEXT_PAGES * 2);
  } catch (err) {
    console.warn("[query] searchIndex vector search failed:", err);
    // Vector search failure is non-fatal — fall back to BM25 only
  }

  // Phase 1c — Combine via RRF if we have vector results, otherwise pure BM25
  // Keep a wider candidate pool for re-ranking input
  let fusedSlugs: string[];
  if (vectorResults.length > 0) {
    const fused = reciprocalRankFusion(bm25Results, vectorResults);
    fusedSlugs = fused.slice(0, RERANK_CANDIDATE_POOL).map((r) => r.slug);
  } else {
    fusedSlugs = bm25Results.slice(0, RERANK_CANDIDATE_POOL).map((r) => r.slug);
  }

  // Phase 2 — LLM re-ranking of fusion candidates (if available)
  // Instead of sending the full wiki index, we send only the fusion candidates
  // with content snippets so the LLM can make quality relevance judgments.
  if (hasLLMKey() && fusedSlugs.length > 0) {
    try {
      // Load content snippets for each candidate
      const candidateLines: string[] = [];
      for (const slug of fusedSlugs) {
        const page = await readWikiPage(slug);
        const entry = entries.find((e) => e.slug === slug);
        const title = entry?.title ?? page?.title ?? slug;
        const summary = entry?.summary ?? "";
        // Use the first N chars of the page body as a content snippet
        const snippet = page
          ? page.content.slice(0, RERANK_SNIPPET_CHARS).replace(/\n+/g, " ").trim()
          : summary;
        candidateLines.push(`- slug: ${slug} | title: ${title} | snippet: ${snippet}`);
      }

      const candidatesText = candidateLines.join("\n");
      const prompt = RERANK_PROMPT
        .replace("{candidates}", candidatesText)
        .replace("{max}", String(MAX_CONTEXT_PAGES));
      const response = await callLLM(prompt, question);

      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as unknown;
        if (Array.isArray(parsed)) {
          const validSlugs = new Set(fusedSlugs);
          const rerankedSlugs = parsed
            .filter((s): s is string => typeof s === "string" && validSlugs.has(s))
            .slice(0, MAX_CONTEXT_PAGES);

          if (rerankedSlugs.length > 0) {
            return rerankedSlugs;
          }
        }
      }
    } catch (err) {
      console.warn("[query] searchIndex LLM re-ranking failed:", err);
      // Fall through to fusion results
    }
  }

  return fusedSlugs.slice(0, MAX_CONTEXT_PAGES);
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

/**
 * Build a context string from wiki pages.
 *
 * When `slugs` is provided, only those pages are loaded.
 * When omitted or empty, returns empty context.
 */
export async function buildContext(slugs?: string[]): Promise<{
  context: string;
  slugs: string[];
}> {
  if (!slugs || slugs.length === 0) {
    return { context: "", slugs: [] };
  }

  const loadedSlugs: string[] = [];
  const parts: string[] = [];

  for (const slug of slugs) {
    const page = await readWikiPage(slug);
    if (page) {
      loadedSlugs.push(page.slug);
      parts.push(
        `=== Page: ${page.title} (slug: ${page.slug}) ===\n${page.content}`,
      );
    }
  }

  return { context: parts.join("\n\n"), slugs: loadedSlugs };
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

// Re-export extractCitedSlugs from the shared citations module so existing
// consumers that import from "./query" continue to work.
export { extractCitedSlugs } from "./citations";

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
  entries: IndexEntry[],
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

  // Append the table-formatting hint when requested. Prose is the default and
  // adds nothing, so existing callers see identical output.
  if (format === "table") {
    systemPrompt += `\n\n${TABLE_FORMAT_INSTRUCTION}`;
  }

  return systemPrompt;
}

/**
 * Select which wiki pages to load for answering a question.
 *
 * For small wikis (<= {@link SMALL_WIKI_THRESHOLD}), returns all pages.
 * For larger wikis, uses BM25 + LLM-based index search.
 *
 * Exported so the streaming endpoint can reuse the same selection logic.
 */
export async function selectPagesForQuery(
  question: string,
  entries: IndexEntry[],
): Promise<string[]> {
  if (entries.length <= SMALL_WIKI_THRESHOLD) {
    return entries.map((e) => e.slug);
  }

  const selected = await searchIndex(question, entries);

  // If no matches found, fall back to first N pages
  if (selected.length === 0) {
    return entries.slice(0, MAX_CONTEXT_PAGES).map((e) => e.slug);
  }

  return selected;
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
 * `"table"` adds a system-prompt hint asking for a markdown comparison table.
 */
export async function query(
  question: string,
  format: QueryFormat = "prose",
): Promise<QueryResult> {
  return withPageCache(async () => {
    const entries = await listWikiPages();

    // Empty wiki — nothing to query
    if (entries.length === 0) {
      return {
        answer:
          "The wiki is empty. Please [ingest some content](/ingest) first so I have something to answer from.",
        sources: [],
      };
    }

    // Determine which pages to load
    const selectedSlugs = await selectPagesForQuery(question, entries);

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
