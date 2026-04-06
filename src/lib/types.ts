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
