import { callLLM, hasLLMKey } from "./llm";
import {
  listWikiPages,
  readWikiPage,
  writeWikiPageWithSideEffects,
} from "./wiki";
import { slugify, loadPageConventions, extractSummary } from "./ingest";
import { extractCitedSlugs } from "./citations";
import { searchByVector } from "./embeddings";
import type { IndexEntry, QueryResult } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of pages to include in context for large wikis. */
const MAX_CONTEXT_PAGES = 10;

/** If the wiki has this many or fewer pages, load all of them (no filtering). */
const SMALL_WIKI_THRESHOLD = 5;

/** Stop words to exclude when tokenizing a question for keyword matching. */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "what", "how", "which", "does", "do", "did", "has", "have", "had",
  "who", "whom", "whose", "where", "when", "why",
  "can", "could", "would", "should", "will", "shall", "may", "might",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
  "into", "through", "during", "before", "after", "above", "below",
  "and", "or", "but", "not", "no", "nor", "so", "if", "then", "than",
  "this", "that", "these", "those", "it", "its",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "they", "them",
  "tell", "explain", "describe", "give", "show",
]);

const SYSTEM_PROMPT_TEMPLATE = `You are a wiki assistant. Answer the user's question using ONLY the wiki pages provided below.

Rules:
- Base your answer strictly on the wiki content provided
- Cite your sources using markdown links: [Page Title](slug.md)
- If the wiki doesn't contain enough information to answer, say so clearly
- Format your answer in markdown
{index_section}
Wiki pages:
{context}`;

const INDEX_SELECTION_PROMPT = `You are a wiki search assistant. Given a user's question and a wiki index, return the slugs of the most relevant pages to answer the question.

Return ONLY a JSON array of slug strings, no other text. Maximum 10 slugs, ordered by relevance.

Example response:
["machine-learning", "neural-networks", "backpropagation"]

Wiki index:
{index}`;

// ---------------------------------------------------------------------------
// BM25 sparse index search
// ---------------------------------------------------------------------------

/**
 * Tokenize a string into lowercase words, filtering out stop words and
 * very short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/** BM25 term-frequency saturation parameter. Standard default is 1.2–2.0. */
const BM25_K1 = 1.5;
/** BM25 length-normalization parameter. Standard default is 0.75. */
const BM25_B = 0.75;

/**
 * Precomputed corpus statistics needed to evaluate BM25 against a set of
 * index entries.
 */
export interface CorpusStats {
  /** Number of documents in the corpus. */
  N: number;
  /** Average document length in tokens. */
  avgdl: number;
  /** Document frequency per term: number of entries containing the term. */
  df: Map<string, number>;
  /** Tokenized body for each entry, keyed by slug. */
  docTokens: Map<string, string[]>;
}

/**
 * Build BM25 corpus statistics for a list of index entries.
 *
 * When `fullBody` is true (the default), reads each wiki page from disk and
 * tokenizes title + full body content, falling back to title + summary if a
 * page can't be read.  When false, uses only the index-level title + summary
 * (cheaper, used in tests).
 *
 * Performance note: the full-body path reads every page from disk, which is
 * fine at the current scale (tens to low hundreds of pages). This is
 * explicitly a bridge until vector search arrives.
 */
export async function buildCorpusStats(
  entries: IndexEntry[],
  opts?: { fullBody?: boolean },
): Promise<CorpusStats> {
  const useFullBody = opts?.fullBody ?? true;
  const docTokens = new Map<string, string[]>();
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const entry of entries) {
    let text = `${entry.title} ${entry.summary}`;

    if (useFullBody) {
      try {
        const page = await readWikiPage(entry.slug);
        if (page) {
          text = `${entry.title} ${page.content}`;
        }
      } catch {
        // Fall back to title + summary if page can't be read
      }
    }

    const tokens = tokenize(text);
    docTokens.set(entry.slug, tokens);
    totalLen += tokens.length;

    // Count each unique term once for df
    const seen = new Set<string>();
    for (const tok of tokens) {
      if (!seen.has(tok)) {
        seen.add(tok);
        df.set(tok, (df.get(tok) ?? 0) + 1);
      }
    }
  }

  const N = entries.length;
  const avgdl = N > 0 ? totalLen / N : 0;

  return { N, avgdl, df, docTokens };
}

/**
 * Okapi BM25 score for a single index entry against a tokenized query.
 *
 * Implements the standard formulation from Robertson, Walker, Jones,
 * Hancock-Beaulieu & Gatford, "Okapi at TREC-3" (1994), and as summarized in
 * Robertson & Zaragoza, "The Probabilistic Relevance Framework: BM25 and
 * Beyond" (2009). Parameters `k1 = 1.5` and `b = 0.75` are the widely used
 * defaults — `k1` controls how quickly term-frequency saturates and `b`
 * controls how aggressively long documents are penalized. IDF uses the
 * `ln(1 + (N - df + 0.5) / (df + 0.5))` form, which stays non-negative even
 * when a term appears in every document.
 */
export function bm25Score(
  entry: IndexEntry,
  queryTokens: string[],
  corpusStats: CorpusStats,
): number {
  if (queryTokens.length === 0 || corpusStats.N === 0) {
    return 0;
  }

  const tokens = corpusStats.docTokens.get(entry.slug);
  if (!tokens || tokens.length === 0) {
    return 0;
  }

  // Per-document term frequencies
  const tf = new Map<string, number>();
  for (const tok of tokens) {
    tf.set(tok, (tf.get(tok) ?? 0) + 1);
  }

  const dl = tokens.length;
  const avgdl = corpusStats.avgdl || 1; // guard against div-by-zero
  let score = 0;

  for (const term of queryTokens) {
    const termFreq = tf.get(term) ?? 0;
    if (termFreq === 0) continue;

    const df = corpusStats.df.get(term) ?? 0;
    const idf = Math.log(
      1 + (corpusStats.N - df + 0.5) / (df + 0.5),
    );

    const numerator = termFreq * (BM25_K1 + 1);
    const denominator =
      termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl));

    score += idf * (numerator / denominator);
  }

  return score;
}

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion (RRF)
// ---------------------------------------------------------------------------

/** Standard RRF constant — dampens the influence of high-rank positions. */
const RRF_K = 60;

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
 * Phase 2: LLM-based selection (if available, overrides fusion ranking)
 *
 * Falls back to BM25 results if LLM call fails.
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
  } catch {
    // Vector search failure is non-fatal — fall back to BM25 only
  }

  // Phase 1c — Combine via RRF if we have vector results, otherwise pure BM25
  let fusedSlugs: string[];
  if (vectorResults.length > 0) {
    const fused = reciprocalRankFusion(bm25Results, vectorResults);
    fusedSlugs = fused.slice(0, MAX_CONTEXT_PAGES).map((r) => r.slug);
  } else {
    fusedSlugs = bm25Results.slice(0, MAX_CONTEXT_PAGES).map((r) => r.slug);
  }

  // Phase 2 — LLM-based selection (if available)
  if (hasLLMKey()) {
    try {
      const indexText = entries
        .map((e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`)
        .join("\n");

      const prompt = INDEX_SELECTION_PROMPT.replace("{index}", indexText);
      const response = await callLLM(prompt, question);

      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as unknown;
        if (Array.isArray(parsed)) {
          const validSlugs = new Set(entries.map((e) => e.slug));
          const llmSlugs = parsed
            .filter((s): s is string => typeof s === "string" && validSlugs.has(s))
            .slice(0, MAX_CONTEXT_PAGES);

          if (llmSlugs.length > 0) {
            return llmSlugs;
          }
        }
      }
    } catch {
      // Fall through to fused/keyword results
    }
  }

  return fusedSlugs;
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
 */
export async function query(question: string): Promise<QueryResult> {
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

  const systemPrompt = await buildQuerySystemPrompt(context, entries, selectedSlugs);

  const answer = await callLLM(systemPrompt, question);

  // All slugs in the wiki are valid citation targets
  const allSlugs = entries.map((e) => e.slug);
  const sources = extractCitedSlugs(answer, allSlugs);

  return { answer, sources };
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

  // Hand off to the unified write pipeline. We pass the original answer
  // `content` (rather than `pageContent`) as the cross-ref source so the
  // related-pages prompt sees the same text the user actually saw.
  const { slug: writtenSlug } = await writeWikiPageWithSideEffects({
    slug,
    title,
    content: pageContent,
    summary,
    logOp: "save",
    crossRefSource: content,
    logDetails: ({ updatedSlugs }) =>
      `query answer saved as ${slug} · linked ${updatedSlugs.length} related page(s)`,
  });

  return { slug: writtenSlug };
}
