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
}

/** Result returned after ingesting a source document. */
export interface IngestResult {
  rawPath: string;
  wikiPages: string[];
  indexUpdated: boolean;
}

/** Result from a query against the wiki. */
export interface QueryResult {
  answer: string; // Markdown-formatted answer with citations
  sources: string[]; // slugs of wiki pages used as sources
}

/** A single issue found by the lint operation. */
export interface LintIssue {
  type: "orphan-page" | "stale-index" | "missing-crossref" | "empty-page" | "contradiction";
  slug: string;
  message: string;
  severity: "error" | "warning" | "info";
}

/** Result returned by the lint operation. */
export interface LintResult {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
}
