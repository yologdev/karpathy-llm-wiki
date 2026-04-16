import { readWikiPage } from "./wiki";
import type { IndexEntry } from "./types";
import { BM25_K1, BM25_B } from "./constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Tokenize a string into lowercase words, filtering out stop words and
 * very short tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// BM25 corpus stats + scoring
// ---------------------------------------------------------------------------

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
      } catch (err) {
        console.warn(`[query] buildCorpusStats failed to read page "${entry.slug}":`, err);
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
