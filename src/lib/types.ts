/** A wiki page read from disk. */
export interface WikiPage {
  slug: string;
  title: string;
  content: string;
  path: string;
}

/** A single entry in wiki/index.md. */
export interface IndexEntry {
  slug: string;
  title: string;
  summary: string;
  /** Optional frontmatter-derived fields. Optional so legacy index entries
   * (and pages without frontmatter) still parse into a valid `IndexEntry`. */
  tags?: string[];
  /** ISO-ish string from the page's `updated` frontmatter field. */
  updated?: string;
  /** Number of raw sources this page was built from. */
  sourceCount?: number;
  /** Original source URL (from URL-based ingest). */
  sourceUrl?: string;
}

/** Result returned after ingesting a source document. */
export interface IngestResult {
  rawPath: string;
  /** Slug of the newly created/updated primary page. */
  primarySlug: string;
  /** Slugs of pre-existing pages that had cross-refs updated. Empty if none. */
  relatedUpdated: string[];
  /**
   * Flat list of every page this ingest touched: `[primarySlug, ...relatedUpdated]`.
   * Kept for backwards compatibility with the existing API consumers.
   */
  wikiPages: string[];
  indexUpdated: boolean;
  /**
   * When `preview: true`, contains the generated wiki markdown that would be
   * written to disk. Absent during a normal (non-preview) ingest.
   */
  previewContent?: string;
  /** The original source URL, if the ingest was URL-based. */
  sourceUrl?: string;
}

/** Result from a query against the wiki. */
export interface QueryResult {
  answer: string; // Markdown-formatted answer with citations
  sources: string[]; // slugs of wiki pages used as sources
}

/** A single issue found by the lint operation. */
export interface LintIssue {
  type: "orphan-page" | "stale-index" | "missing-crossref" | "empty-page" | "contradiction" | "missing-concept-page" | "broken-link";
  slug: string;
  /** Structured target slug for cross-ref, contradiction, and broken-link fixes.
   * Eliminates the need to parse human-readable messages to extract targets. */
  target?: string;
  message: string;
  severity: "error" | "warning" | "info";
  /** Actionable hint for resolving the issue — e.g. a search query to find
   * authoritative sources, or a suggestion to ingest new material. */
  suggestion?: string;
}

/** Options to configure which lint checks to run and filter results. */
export interface LintOptions {
  /** Which check types to run. Defaults to all if omitted. */
  checks?: LintIssue["type"][];
  /** Minimum severity to include in results. Defaults to "info". */
  minSeverity?: "error" | "warning" | "info";
}

/** Result returned by the lint operation. */
export interface LintResult {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
}

/** Metadata about the currently configured LLM provider. */
export interface ProviderInfo {
  /** true if any provider key / config is set */
  configured: boolean;
  /** "anthropic" | "openai" | "google" | "ollama" | null */
  provider: string | null;
  /** resolved model name (including LLM_MODEL override) */
  model: string | null;
  /** true if the active provider supports embeddings */
  embeddingSupport: boolean;
}
