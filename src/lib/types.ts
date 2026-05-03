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
  type: "orphan-page" | "stale-index" | "missing-crossref" | "empty-page" | "contradiction" | "missing-concept-page" | "broken-link" | "stale-page" | "low-confidence" | "unmigrated-page" | "duplicate-entity";
  slug: string;
  /** Structured target slug for cross-ref, contradiction, broken-link, and duplicate-entity fixes.
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

/** A single provenance entry in the structured `sources[]` array. */
export interface SourceEntry {
  /** Provenance type: how the source was acquired. */
  type: "url" | "text" | "x-mention";
  /** Source URL or "text-paste" for pasted content. */
  url: string;
  /** ISO date string of when the source was fetched/ingested. */
  fetched: string;
  /** Who triggered the ingest (user handle or "system"). */
  triggered_by: string;
}

// ---------------------------------------------------------------------------
// Talk pages — Phase 2 threaded discussion system
// ---------------------------------------------------------------------------

/** A single comment in a talk page thread. */
export interface TalkComment {
  /** Unique ID (timestamp-based, e.g. "1714600000000") */
  id: string;
  /** Who wrote this comment (user handle or agent ID) */
  author: string;
  /** ISO date string */
  created: string;
  /** Markdown content */
  body: string;
  /** ID of parent comment for threading, or null for top-level */
  parentId: string | null;
}

/** A talk page thread linked to a wiki page. */
export interface TalkThread {
  /** Slug of the wiki page this discussion is about */
  pageSlug: string;
  /** Thread title / topic */
  title: string;
  /** "open" | "resolved" | "wontfix" */
  status: "open" | "resolved" | "wontfix";
  /** ISO date of creation */
  created: string;
  /** ISO date of last activity */
  updated: string;
  /** Ordered list of comments */
  comments: TalkComment[];
}

// ---------------------------------------------------------------------------
// Contributor profiles — Phase 2 trust and attribution
// ---------------------------------------------------------------------------

/** Aggregated profile for a single contributor (human or agent). */
export interface ContributorProfile {
  /** Author handle (matches revision `author` and talk comment `author`) */
  handle: string;
  /** Total number of revisions authored */
  editCount: number;
  /** Number of distinct wiki pages edited */
  pagesEdited: number;
  /** Number of talk page comments authored */
  commentCount: number;
  /** Number of talk threads created */
  threadsCreated: number;
  /** ISO date of the author's first known activity */
  firstSeen: string;
  /** ISO date of the author's most recent activity */
  lastSeen: string;
  /** Number of revisions where this author's content was subsequently reverted
   *  (i.e., a later revision by a different author substantially reduced content). */
  revertCount: number;
  /** Trust score 0–1. Heuristic based on activity volume and revert rate.
   *  Formula: min(1, (editCount + commentCount) / 50) * (1 - min(0.5, revertCount * 0.1))
   *  Each revert reduces trust by 10%, capped at 50% reduction. */
  trustScore: number;
}

// ---------------------------------------------------------------------------
// Agent profiles — Phase 4 agent identity as yopedia pages
// ---------------------------------------------------------------------------

/** An agent registered in yopedia. */
export interface AgentProfile {
  /** Unique agent identifier (e.g. "yoyo") */
  id: string;
  /** Display name */
  name: string;
  /** Short description of who this agent is */
  description: string;
  /** Wiki page slugs that form this agent's identity context */
  identityPages: string[];
  /** Wiki page slugs containing this agent's learnings */
  learningPages: string[];
  /** Wiki page slugs containing social wisdom */
  socialPages: string[];
  /** ISO date of when the agent was registered */
  registered: string;
  /** ISO date of last context update */
  lastUpdated: string;
}

// ---------------------------------------------------------------------------

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
