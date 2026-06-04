import {
  saveRawSource,
  writeWikiPageWithSideEffects,
  readWikiPageWithFrontmatter,
  serializeFrontmatter,
  listWikiPages,
  findRelatedPages,
  type Frontmatter,
} from "./wiki";
import { callLLM, hasLLMKey } from "./llm";
import { fetchUrlContent, downloadImages, fetchImageBytes, storeImageBytes } from "./fetch";
import { describeImage } from "./vision";
import { isYouTubeUrl, fetchYouTubeContent } from "./youtube";
import type { IngestResult, SourceEntry } from "./types";
import {
  serializeSources,
  parseSources,
  buildSourceEntry,
} from "./sources";

/**
 * Merge a provenance entry into a sources list. A real source URL supersedes a
 * stale `"text-paste"` placeholder of the same type (the placeholder just means
 * "no URL was known"), so once a real URL arrives the placeholder is dropped.
 * Updates an existing match in place; otherwise appends.
 */
function mergeSourceEntry(sources: SourceEntry[], entry: SourceEntry): SourceEntry[] {
  const base =
    entry.url !== "text-paste"
      ? sources.filter((s) => !(s.type === entry.type && s.url === "text-paste"))
      : sources;
  const idx = base.findIndex((s) => s.url === entry.url && s.type === entry.type);
  if (idx >= 0) {
    base[idx] = { ...base[idx], fetched: entry.fetched, triggered_by: entry.triggered_by };
  } else {
    base.push(entry);
  }
  return base;
}
import {
  MAX_LLM_INPUT_CHARS,
  INGEST_MAX_OUTPUT_TOKENS,
  MAX_APPENDED_IMAGES,
  MAX_CONTENT_LENGTH,
  MAX_PDF_SIZE,
} from "./constants";
import { ClientInputError } from "./errors";
import { slugify } from "./slugify";
import { loadPageConventions } from "./schema";
import { getRawDir } from "./config";
import { resolveAlias } from "./alias-index";
import {
  resolveSourceUrl,
  resolveContentHash,
  updateSourceIndexForPage,
} from "./source-index";
import { contentHash } from "./embeddings";
import { getStorage } from "./storage";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Ingest ledger — append-only JSONL record of each ingest operation
// ---------------------------------------------------------------------------

/** A single entry in the ingest ledger (data/ingest-ledger.jsonl). */
export interface LedgerEntry {
  ingest_id: string;
  source_type: string;
  source_url: string;
  primary_slug: string;
  related_slugs: string[];
  started_at: string;
  finished_at: string;
  status: string;
}

/** Relative path to the ingest ledger within the StorageProvider root. */
const LEDGER_REL_PATH = "data/ingest-ledger.jsonl";

/**
 * Returns the relative storage path to the ingest ledger JSONL file.
 * Exported for testing.
 */
export function getLedgerPath(): string {
  return LEDGER_REL_PATH;
}

/**
 * Read the ingest ledger, returning entries most-recent-first.
 *
 * Gracefully returns an empty array if the file doesn't exist.
 * Malformed JSONL lines are silently skipped.
 *
 * @param limit  Maximum number of entries to return (default: all)
 */
export async function readLedger(limit?: number): Promise<LedgerEntry[]> {
  let raw: string;
  try {
    raw = await getStorage().readFile(LEDGER_REL_PATH);
  } catch {
    // File doesn't exist or is unreadable — return empty
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const entries: LedgerEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as LedgerEntry);
    } catch {
      // Skip malformed lines
    }
  }

  // Most recent first (ledger is append-only, so reverse)
  entries.reverse();

  if (limit !== undefined && limit > 0) {
    return entries.slice(0, limit);
  }
  return entries;
}

/**
 * Append a single ledger entry to data/ingest-ledger.jsonl.
 *
 * StorageProvider.appendFile creates parent directories as needed.
 * Errors are caught and logged so a ledger I/O failure never breaks
 * the ingest pipeline.
 */
export async function persistToLedger(entry: LedgerEntry): Promise<void> {
  try {
    await getStorage().appendFile(LEDGER_REL_PATH, JSON.stringify(entry) + "\n");
  } catch (err) {
    logger.error("ingest", "Failed to write ledger entry:", err);
  }
}

/**
 * Ingest a URL into the wiki.
 *
 * 1. Fetch and extract the page content
 * 2. Delegate to the standard `ingest()` pipeline
 */
export async function ingestUrl(
  url: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  // Dedup: if this URL is already a canonical page, attach the triggerer and
  // skip the fetch + LLM + embedding entirely. Not for preview / commit-from-
  // preview (those are explicit content workflows).
  if (!options?.preview && !options?.generatedContent) {
    const dupSlug = await resolveSourceUrl(url);
    if (dupSlug) {
      const result = await attachIngestTrigger(dupSlug, {
        url,
        type: options?.sourceType ?? "url",
        triggeredBy: options?.triggeredBy,
      });
      if (result) return result;
    }
  }

  if (isYouTubeUrl(url)) {
    return ingestYouTube(url, options);
  }

  const { title, content } = await fetchUrlContent(url);
  // Image downloading is centralized in ingest() so every path (url, text,
  // agent, X) captures embedded images uniformly.
  return ingest(title, content, { ...options, sourceUrl: url });
}

/** Derive a concise page title from the vision description's first meaningful
 *  line (e.g. a transcribed headline). Returns undefined if nothing usable. */
function deriveImageTitle(visionText?: string): string | undefined {
  if (!visionText) return undefined;
  const firstLine = visionText
    .split("\n")
    .map((l) => l.replace(/^[#>\-*\d.\s)]+/, "").trim())
    .find((l) => l.length > 0);
  if (!firstLine) return undefined;
  let title = firstLine;
  const sentenceEnd = title.search(/[.!?。！？\n]/);
  if (sentenceEnd >= 8 && sentenceEnd < 80) title = title.slice(0, sentenceEnd);
  title = title.slice(0, 80).trim();
  return title || undefined;
}

/** Derive a human-ish title from a filename or URL (e.g. "diagram-2.png" →
 *  "diagram 2"). Falls back to "Image". */
function humanizeFilename(nameOrUrl: string): string {
  let base = nameOrUrl;
  try {
    base = new URL(nameOrUrl).pathname.split("/").pop() || nameOrUrl;
  } catch {
    // not a URL — use as-is
  }
  base = base.split("?")[0].split("#")[0].replace(/\.[a-z0-9]+$/i, "");
  return base.replace(/[-_]+/g, " ").trim() || "Image";
}

/**
 * Ingest a single image. Stores the image as an asset, runs a vision model to
 * extract a description (fail-soft), and writes a wiki page that embeds the
 * image followed by the description. The LLM re-distillation is skipped (the
 * body is already small and correct) but frontmatter/dedup/embedding all reuse
 * the normal {@link ingest} pipeline.
 *
 * Accepts either an `imageUrl` (fetched + SSRF-guarded) or raw `bytes` (upload).
 */
export async function ingestImage(
  input: { imageUrl?: string; bytes?: ArrayBuffer; filename?: string; contentType?: string },
  options?: IngestOptions & { title?: string },
): Promise<IngestResult> {
  const { imageUrl, bytes: uploadedBytes, filename: uploadName } = input;

  // Dedup by URL first — cheapest path (no fetch, no vision, no LLM).
  if (imageUrl && !options?.preview && !options?.generatedContent) {
    const dupSlug = await resolveSourceUrl(imageUrl);
    if (dupSlug) {
      const result = await attachIngestTrigger(dupSlug, {
        url: imageUrl,
        type: "image",
        triggeredBy: options?.triggeredBy,
      });
      if (result) return result;
    }
  }

  // 1. Obtain the bytes + metadata WITHOUT storing yet — we may title the page
  //    (and thus the slug) from the vision text, so the slug isn't known yet.
  let bytes: ArrayBuffer;
  let filename: string;
  let mediaType: string | undefined;
  if (imageUrl) {
    const fetched = await fetchImageBytes(imageUrl);
    bytes = fetched.bytes;
    filename = fetched.filename;
    mediaType = fetched.contentType;
  } else if (uploadedBytes) {
    bytes = uploadedBytes;
    filename = uploadName || "image";
    mediaType = input.contentType;
  } else {
    throw new Error("ingestImage requires either imageUrl or bytes");
  }

  // 2. Vision description — fail-soft (null → image-only page).
  const vision = await describeImage(bytes, { mediaType });

  // 3. Title: explicit → derived from the vision text → humanized filename.
  const title =
    options?.title?.trim() ||
    deriveImageTitle(vision?.text) ||
    humanizeFilename(filename || imageUrl || "image");
  const slug = slugify(title);

  // 4. Store the asset under the final slug.
  const { localPath } = await storeImageBytes(bytes, slug, filename);

  const body =
    `# ${title}\n\n![${title}](${localPath})` + (vision ? `\n\n${vision.text}` : "");

  // generatedContent writes `body` as-is (skip the wiki-editor LLM) while still
  // reusing frontmatter, dedup, embedding, cross-refs, and the ledger.
  return ingest(title, body, {
    ...options,
    generatedContent: body,
    sourceUrl: imageUrl ?? "upload",
    sourceType: "image",
  });
}

/**
 * Ingest a PDF — either from a URL or uploaded bytes.
 *
 * URL path: dedup check → fetchUrlContent (which handles application/pdf) → ingest().
 * Upload path: extract text via unpdf → ingest() with sourceType "pdf".
 */
export async function ingestPdf(
  input: { pdfUrl: string } | { bytes: ArrayBuffer; filename: string },
  options?: Omit<IngestOptions, "sourceType"> & { title?: string; tags?: string[] },
): Promise<IngestResult> {
  // URL path: delegate to ingestUrl which already handles PDF content-type
  if ("pdfUrl" in input) {
    const url = input.pdfUrl;
    // Dedup check
    if (!options?.preview && !options?.generatedContent) {
      const dupSlug = await resolveSourceUrl(url);
      if (dupSlug) {
        const result = await attachIngestTrigger(dupSlug, {
          url,
          type: "pdf",
          triggeredBy: options?.triggeredBy,
        });
        if (result) return result;
      }
    }
    // fetchUrlContent now handles application/pdf natively
    const { title, content } = await fetchUrlContent(url);
    return ingest(options?.title ?? title, content, {
      ...options,
      sourceUrl: url,
      sourceType: "pdf",
    });
  }

  // Upload path: extract text from bytes directly
  const { bytes, filename } = input;
  if (bytes.byteLength > MAX_PDF_SIZE) {
    throw new ClientInputError(
      `PDF too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_PDF_SIZE / 1024 / 1024} MB.`,
    );
  }

  const { getDocumentProxy, extractText } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text } = await extractText(doc, { mergePages: true });
    const trimmed = text.trim();
    if (!trimmed) {
      throw new ClientInputError(
        "PDF has no extractable text layer. Scanned/image-only PDFs are not supported yet.",
      );
    }
    const content =
      trimmed.length > MAX_CONTENT_LENGTH
        ? trimmed.slice(0, MAX_CONTENT_LENGTH)
        : trimmed;

    // Derive title from first line or filename
    const firstLine =
      trimmed.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
    const derivedTitle =
      firstLine.length > 200 ? firstLine.slice(0, 200) : firstLine;
    const title =
      options?.title ||
      derivedTitle ||
      filename.replace(/\.pdf$/i, "") ||
      "PDF Document";

    return ingest(title, content, {
      ...options,
      sourceType: "pdf",
    });
  } finally {
    await doc.cleanup();
  }
}

/**
 * Re-ingest a previously ingested wiki page by re-fetching its `source_url`.
 *
 * Reads the page's frontmatter to find the original URL, fetches fresh content,
 * and runs the standard ingest pipeline to update the page.
 *
 * @throws {Error} When the page doesn't exist or has no `source_url` in its frontmatter.
 */
export async function reingest(
  slug: string,
  opts?: { author?: string; owner?: string; triggeredBy?: string },
): Promise<IngestResult> {
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) {
    throw new Error(`Cannot re-ingest: page "${slug}" not found`);
  }

  const sourceUrl = page.frontmatter.source_url;
  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
    throw new Error("Cannot re-ingest: no source URL recorded");
  }

  if (isYouTubeUrl(sourceUrl)) {
    const { title, content } = await fetchYouTubeContent(sourceUrl);
    return ingest(title, content, { sourceUrl, sourceType: "youtube", ...opts });
  }

  const { title, content: rawContent } = await fetchUrlContent(sourceUrl);
  const content = await downloadImages(rawContent, slug, getRawDir());
  return ingest(title, content, { sourceUrl, ...opts });
}

/**
 * Ingest an X (Twitter) post into the wiki.
 *
 * Fetches the post content via URL, then delegates to the standard ingest
 * pipeline with `x-mention` provenance so the source is correctly attributed.
 *
 * @param url         - Full URL to the X/Twitter post.
 * @param triggeredBy - Handle of the user or agent that triggered the ingest.
 */
export async function ingestXMention(
  url: string,
  triggeredBy: string,
  opts?: { author?: string; owner?: string },
): Promise<IngestResult> {
  return ingestUrl(url, {
    sourceType: "x-mention",
    triggeredBy,
    ...opts,
  });
}

/**
 * Ingest a YouTube video into the wiki.
 *
 * Fetches the video transcript and metadata via the youtube module,
 * then delegates to the standard ingest pipeline with `youtube` provenance.
 */
export async function ingestYouTube(
  url: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  const { title, content } = await fetchYouTubeContent(url);
  return ingest(title, content, {
    ...options,
    sourceUrl: url,
    sourceType: "youtube",
  });
}

// ---------------------------------------------------------------------------
// Fallback stub (no API key)
// ---------------------------------------------------------------------------

function generateFallbackPage(title: string, content: string): string {
  const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
  return `# ${title}\n\n## Summary\n\n${preview}\n\n## Raw Content\n\n${content}`;
}

// ---------------------------------------------------------------------------
// Image preservation
// ---------------------------------------------------------------------------

/**
 * Append the source's downloaded images to the wiki body as a trailing
 * `## Images` section. The LLM distills text and drops image refs, so this
 * deterministically re-surfaces them (no LLM cost, no hallucinated paths).
 *
 * Only locally-downloaded images (`assets/...` refs, produced by
 * {@link downloadImages}) are included — they're guaranteed servable via
 * `/api/assets`. Idempotent: if the body already has an `## Images` heading
 * (e.g. a preview→commit round-trip), it's returned unchanged.
 */
function appendSourceImages(wikiBody: string, sourceContent: string): string {
  if (/^##\s+Images\s*$/m.test(wikiBody)) return wikiBody;

  const re = /!\[([^\]]*)\]\((assets\/[^)\s]+)\)/g;
  const seen = new Set<string>();
  const refs: { alt: string; ref: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceContent)) !== null) {
    const ref = m[2];
    if (seen.has(ref)) continue;
    seen.add(ref);
    // Don't duplicate an image the body already embeds (e.g. the image-ingest
    // page, where the image is the page's centerpiece).
    if (wikiBody.includes(`](${ref})`)) continue;
    refs.push({ alt: m[1], ref });
    if (refs.length >= MAX_APPENDED_IMAGES) break;
  }
  if (refs.length === 0) return wikiBody;

  const section = refs.map(({ alt, ref }) => `![${alt}](${ref})`).join("\n\n");
  return `${wikiBody}\n\n## Images\n\n${section}`;
}

// ---------------------------------------------------------------------------
// Summary extraction
// ---------------------------------------------------------------------------

/**
 * Extract a short summary from content by finding the first sentence.
 *
 * Uses sentence-ending punctuation followed by whitespace (`[.!?]\s`) or
 * paragraph breaks (`\n\n`) as boundaries — avoids splitting on abbreviations
 * like "Dr." or "U.S." where the period is not followed by a space that starts
 * a new sentence (though it's a heuristic, not perfect).
 *
 * Returns at most `maxLen` characters.
 */
export function extractSummary(content: string, maxLen = 200): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  // Look for a sentence boundary: period/exclamation/question followed by a space
  const sentenceEnd = trimmed.search(/[.!?]\s/);
  // Look for a paragraph break
  const paraBreak = trimmed.indexOf("\n\n");

  // Pick the earliest valid boundary
  let cutoff = -1;
  if (sentenceEnd !== -1 && paraBreak !== -1) {
    cutoff = Math.min(sentenceEnd + 1, paraBreak); // +1 to include the punctuation
  } else if (sentenceEnd !== -1) {
    cutoff = sentenceEnd + 1;
  } else if (paraBreak !== -1) {
    cutoff = paraBreak;
  }

  let summary: string;
  if (cutoff !== -1 && cutoff <= maxLen) {
    summary = trimmed.slice(0, cutoff).trim();
  } else {
    // No sentence boundary found or it's too far — just truncate
    summary =
      trimmed.length > maxLen
        ? trimmed.slice(0, maxLen).trim() + "..."
        : trimmed.trim();
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Content chunking
// ---------------------------------------------------------------------------

/**
 * Split text into chunks of at most `maxChars` characters.
 *
 * Strategy:
 * 1. Split on paragraph boundaries (`\n\n`).
 * 2. Greedily combine paragraphs into chunks up to `maxChars`.
 * 3. If a single paragraph exceeds `maxChars`, split it on sentence
 *    boundaries (`. `, `! `, `? ` followed by whitespace or end-of-string).
 * 4. If a single sentence still exceeds `maxChars`, hard-split at `maxChars`.
 *
 * Returns an array of chunks, each ≤ `maxChars`.
 */
export function chunkText(text: string, maxChars: number = MAX_LLM_INPUT_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    // If this single paragraph fits in the current chunk, append it
    if (current.length === 0 && para.length <= maxChars) {
      current = para;
      continue;
    }

    if (current.length > 0 && current.length + 2 + para.length <= maxChars) {
      current += "\n\n" + para;
      continue;
    }

    // Flush current chunk if non-empty
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }

    // If the paragraph itself fits in a chunk, start a new chunk with it
    if (para.length <= maxChars) {
      current = para;
      continue;
    }

    // Oversized paragraph — split on sentence boundaries
    const sentences = splitSentences(para);
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        // Hard-split an oversized sentence
        for (let i = 0; i < sentence.length; i += maxChars) {
          const piece = sentence.slice(i, i + maxChars);
          if (current.length === 0) {
            chunks.push(piece);
          } else if (current.length + 1 + piece.length <= maxChars) {
            current += " " + piece;
          } else {
            chunks.push(current);
            chunks.push(piece);
            current = "";
          }
        }
        continue;
      }

      if (current.length === 0) {
        current = sentence;
      } else if (current.length + 1 + sentence.length <= maxChars) {
        current += " " + sentence;
      } else {
        chunks.push(current);
        current = sentence;
      }
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Split a paragraph into sentences. Uses sentence-ending punctuation
 * followed by whitespace as the delimiter. Keeps the punctuation attached
 * to the sentence.
 */
function splitSentences(text: string): string[] {
  // Temporarily replace markdown image/link references so their internal
  // dots (e.g. "image.jpg") don't trigger sentence-boundary splits.
  const placeholders: string[] = [];
  const shielded = text.replace(/!?\[[^\]]*\]\([^)]*\)/g, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\x00MDREF${idx}\x00`;
  });

  // Split after sentence-ending punctuation followed by whitespace
  const parts = shielded.split(/(?<=[.!?])\s+/);

  // Restore placeholders
  return parts
    .map((s) =>
      s.replace(/\x00MDREF(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]),
    )
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Ingest pipeline
// ---------------------------------------------------------------------------

// Conventions are documented in SCHEMA.md at the repo root.
const INGEST_SYSTEM_PROMPT_BASE = `You are a wiki editor. Given a source document, generate a wiki article in markdown format.

Include:
- A title as a level-1 heading (# Title)
- A brief summary section (## Summary)
- Key points or takeaways (## Key Points)
- Notable entities, concepts, or terms worth remembering (## Concepts)
- A detailed section (## Details) that faithfully preserves the source's
  substantive content — important explanations, definitions, examples, steps,
  data, and notable passages — written as readable prose and lists, not just
  one-line bullets. Aim to retain what a reader would need so the page can
  stand in for the source. Do not pad, repeat the summary, or invent anything
  not supported by the source.

Output pure markdown and nothing else. Do not wrap in code fences.`;

/**
 * System prompt for continuation chunks when a long source document has been
 * split into multiple parts. The LLM receives the article produced so far and
 * a new batch of source material and should produce only the *additional*
 * sections — no duplicate title or summary.
 */
const CONTINUATION_SYSTEM_PROMPT = `You are a wiki editor. You have already started a wiki article from earlier parts of a long source document. You are now given additional source material.

Add new key points, concepts, and details from the additional source material. Do NOT repeat the title, summary, or any content already in the article. Only output the new sections or bullet points to append.

Output pure markdown and nothing else. Do not wrap in code fences.`;

/**
 * Build the ingest system prompt by composing the base prompt with the
 * "Page conventions" slice of SCHEMA.md loaded at runtime. Read on every
 * call (no caching) so live edits to SCHEMA.md take effect immediately —
 * the whole point is to keep prompt and schema co-evolving.
 */
export async function buildIngestSystemPrompt(): Promise<string> {
  const conventions = await loadPageConventions();
  if (conventions === "") return INGEST_SYSTEM_PROMPT_BASE;
  return `${INGEST_SYSTEM_PROMPT_BASE}

The wiki you are editing follows these conventions (from SCHEMA.md):

${conventions}

Follow these conventions when generating the page.`;
}

// ---------------------------------------------------------------------------
// Ingest options
// ---------------------------------------------------------------------------

/** Options for the two-phase ingest workflow. */
export interface IngestOptions {
  /**
   * When `true`, run the LLM and return the generated wiki content without
   * writing anything to disk. The caller can display this for human review
   * before committing.
   */
  preview?: boolean;
  /**
   * Pre-generated wiki content from a prior preview call. When provided the
   * LLM is skipped entirely and this content is written to disk as-is. This
   * avoids paying for the LLM call twice (once for preview, once for commit).
   */
  generatedContent?: string;
  /**
   * Original source URL. Set automatically by `ingestUrl()` so the URL is
   * persisted in the wiki page's frontmatter as `source_url`.
   */
  sourceUrl?: string;
  /**
   * Provenance type override. When set, this type is used instead of the
   * default `"url"` / `"text"` heuristic when building the `sources[]` entry.
   * Used by `ingestXMention()` to set `"x-mention"` provenance.
   */
  sourceType?: "url" | "text" | "x-mention" | "image" | "pdf" | "youtube";
  /**
   * Who triggered the ingest (user handle or agent ID). Defaults to `"system"`.
   * Passed through to the `triggered_by` field on the `SourceEntry`.
   */
  triggeredBy?: string;
  /**
   * Tags to apply to the created/updated page. Merged with any existing tags
   * when re-ingesting an existing page.
   */
  tags?: string[];
  /**
   * The acting identity that performed this ingest (a user handle, or `yoyo`
   * when mediated). Becomes `authors` on a new page and is appended to
   * `contributors` on re-ingest. Set from the authenticated session by the
   * route — never from client input. Falls back to `"system"`.
   */
  author?: string;
  /**
   * The principal who owns the resulting page (accountable party). For manual
   * ingests this equals `author`; for mediated ingests it's the triggering
   * user. Defaults to `author`.
   */
  owner?: string;
  /**
   * Optional page `type` frontmatter. When set on a NEW page, marks it as
   * agent-scoped so it is excluded from the public browse feed and general
   * search, surfacing only via an `agent:` scope. A union (not open string) so
   * a typo can't silently produce an unscoped page. Ignored on re-ingest of an
   * existing page (its scope is preserved — see below).
   */
  pageType?: "agent-knowledge" | "agent-identity";
}

/**
 * Attach a new ingest trigger to an existing canonical page **without
 * re-synthesizing** — the token-saving dedup path. Used when a source (same URL
 * or identical content) was already ingested: append a provenance entry + the
 * triggerer, bump `updated`, increment `source_count`, but skip the LLM and (the
 * body is unchanged) any new embedding. Returns `null` if the page is missing
 * (stale index) so the caller can fall through to a normal ingest.
 */
async function attachIngestTrigger(
  slug: string,
  source: {
    url: string;
    type: SourceEntry["type"];
    triggeredBy?: string;
  },
): Promise<IngestResult | null> {
  const existing = await readWikiPageWithFrontmatter(slug);
  if (!existing) return null; // index drifted — let the caller ingest normally

  const frontmatter: Frontmatter = { ...existing.frontmatter };
  frontmatter.updated = new Date().toISOString().slice(0, 10);

  // Merge the new provenance entry into sources[] (update fetched/triggered_by
  // if the same source already has an entry, else append).
  const entry = buildSourceEntry(source.url, source.type, source.triggeredBy);
  const existingSourcesRaw = existing.frontmatter.sources;
  const sources = parseSources(
    typeof existingSourcesRaw === "string"
      ? existingSourcesRaw
      : Array.isArray(existingSourcesRaw)
        ? existingSourcesRaw
        : undefined,
  );
  const merged = mergeSourceEntry(sources, entry);
  frontmatter.sources = serializeSources(merged);
  frontmatter.source_count = String(merged.length);

  // Record the triggerer as a contributor (deduped) — drives the "Mine" lens.
  const triggeredBy = source.triggeredBy?.trim();
  if (triggeredBy) {
    const contribs = Array.isArray(existing.frontmatter.contributors)
      ? (existing.frontmatter.contributors as string[])
      : [];
    if (!contribs.includes(triggeredBy)) {
      frontmatter.contributors = [...contribs, triggeredBy];
    }
  }

  const mergedContent = serializeFrontmatter(frontmatter, existing.body);
  await writeWikiPageWithSideEffects({
    slug,
    title: existing.title,
    content: mergedContent,
    summary: extractSummary(existing.body.replace(/^#\s+.+$/m, "").trim()),
    logOp: "ingest",
    crossRefSource: null, // skip the cross-ref LLM — pure dedup attach
    author: triggeredBy,
    logDetails: () => `dedup: attached trigger to existing page "${slug}"`,
  });

  const url =
    typeof frontmatter.source_url === "string" ? frontmatter.source_url : undefined;
  const hash =
    typeof frontmatter.content_hash === "string"
      ? frontmatter.content_hash
      : undefined;
  updateSourceIndexForPage(slug, url, hash);

  return {
    rawPath: "",
    primarySlug: slug,
    relatedUpdated: [],
    wikiPages: [slug],
    indexUpdated: true,
    deduped: true,
    ...(url ? { sourceUrl: url } : {}),
  };
}

/**
 * Ingest a source document into the wiki.
 *
 * Supports a two-phase preview workflow:
 *
 * 1. **Preview** (`options.preview = true`): run the LLM to generate wiki
 *    content and identify related pages, but do NOT write anything to disk.
 *    Returns the result with `previewContent` populated.
 *
 * 2. **Commit from preview** (`options.generatedContent` set): skip the LLM,
 *    use the pre-generated content and write everything to disk. This is the
 *    "approve" step after a human reviews the preview.
 *
 * 3. **Direct ingest** (no options / defaults): the original single-step
 *    behaviour — call the LLM and write immediately. Fully backward-compatible.
 */
export async function ingest(
  title: string,
  content: string,
  options?: IngestOptions,
): Promise<IngestResult> {
  const startedAt = new Date().toISOString();
  const rawSlug = slugify(title);

  if (rawSlug === "") {
    throw new Error(
      "Cannot ingest: title produces an empty slug",
    );
  }

  // --- Alias resolution: check if title matches an existing page's aliases ---
  // This prevents duplicate pages when the same concept appears under different
  // names (e.g. "React.js" vs a page with aliases: ["React.js"]).
  const resolvedSlug = await resolveAlias(title);
  const slug = resolvedSlug ?? rawSlug;

  const isPreview = options?.preview === true;
  const preGeneratedContent = options?.generatedContent;

  // Download any images referenced in the source to local storage and rewrite
  // their markdown refs to `assets/<slug>/...`. Centralized here (not in
  // ingestUrl) so URL, pasted-text, agent, and X ingests all capture images.
  // Skipped when committing pre-generated content (commit-from-preview or the
  // image-ingest body): those already ran image capture / carry local refs, so
  // re-downloading would refetch every image needlessly.
  if (!preGeneratedContent) {
    content = await downloadImages(content, slug, getRawDir());
  }

  // Dedup by content: if identical content was already ingested (any slug),
  // attach the triggerer and skip the LLM + embedding. Not for preview /
  // commit-from-preview.
  const hash = contentHash(content);
  if (!isPreview && !preGeneratedContent) {
    const dupSlug = await resolveContentHash(hash);
    if (dupSlug) {
      const result = await attachIngestTrigger(dupSlug, {
        url: options?.sourceUrl ?? "text-paste",
        type: options?.sourceType ?? (options?.sourceUrl ? "url" : "text"),
        triggeredBy: options?.triggeredBy,
      });
      if (result) return result;
    }
  }

  // 1. Generate wiki page content (or use pre-generated from preview)
  let wikiContent: string;
  if (preGeneratedContent) {
    // Commit-from-preview: skip the LLM, use the content the user approved
    wikiContent = preGeneratedContent;
  } else if (hasLLMKey()) {
    const systemPrompt = await buildIngestSystemPrompt();
    const chunks = chunkText(content, MAX_LLM_INPUT_CHARS);

    // Larger output budget so the ## Details section can preserve substantive
    // source content instead of being truncated.
    const llmOptions = { maxOutputTokens: INGEST_MAX_OUTPUT_TOKENS };

    if (chunks.length === 1) {
      // Short content — single LLM call (no behaviour change)
      wikiContent = await callLLM(systemPrompt, chunks[0], llmOptions);
    } else {
      // Long content — call LLM per chunk, merge results
      // First chunk produces the primary page structure
      wikiContent = await callLLM(systemPrompt, chunks[0], llmOptions);

      // Subsequent chunks add supplemental content
      for (let i = 1; i < chunks.length; i++) {
        const continuation = await callLLM(
          CONTINUATION_SYSTEM_PROMPT,
          `# Existing article so far\n\n${wikiContent}\n\n# Additional source material (part ${i + 1} of ${chunks.length})\n\n${chunks[i]}`,
          llmOptions,
        );
        wikiContent += "\n\n" + continuation;
      }
    }
  } else {
    wikiContent = generateFallbackPage(title, content);
  }

  // The LLM distills text and drops image refs, so deterministically append the
  // source's downloaded images as a trailing section — reliable, no LLM cost.
  wikiContent = appendSourceImages(wikiContent, content);

  // 2. Compute the index summary from the *raw* source so the index reflects
  // the original document, not the LLM's reformatting.
  const summary = extractSummary(content);

  // --- Preview mode: return the generated content without writing ---
  if (isPreview) {
    // Identify which related pages would be updated (read-only check)
    const existingEntries = await listWikiPages();
    const relatedSlugs = await findRelatedPages(slug, content, existingEntries);

    return {
      rawPath: "",
      primarySlug: slug,
      relatedUpdated: relatedSlugs,
      wikiPages: [slug, ...relatedSlugs],
      indexUpdated: false,
      previewContent: wikiContent,
      ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
    };
  }

  // --- Normal commit path (direct ingest or commit-from-preview) ---

  // 3. Save raw source
  const rawPath = await saveRawSource(slug, content);

  // 4. Build / refresh the YAML frontmatter block. New pages get
  // created = updated = today and source_count = 1. Re-ingesting the same
  // slug preserves `created`, advances `updated`, increments `source_count`,
  // and preserves any user-edited tags.
  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 90);
  const expiryDate = expiry.toISOString().slice(0, 10);
  // Acting identity + owner come from the authenticated session (set by the
  // route), never from client input. Fall back to "system" for legacy/bootstrap.
  const actor = options?.author?.trim() || "system";
  const owner = options?.owner?.trim() || actor;
  const frontmatter: Frontmatter = {
    created: now,
    updated: now,
    source_count: "1",
    tags: [],
    confidence: 0.7,
    expiry: expiryDate,
    valid_from: now,
    owner,
    visibility: "public",
    authors: [actor],
    contributors: [],
    disputed: false,
    supersedes: "",
    aliases: [],
    content_hash: hash,
  };

  // Agent-scoped pages carry a `type` (e.g. "agent-knowledge") so they're
  // filtered from the public browse feed and general search.
  if (options?.pageType) {
    frontmatter.type = options.pageType;
  }

  // Persist the original source URL when provided (URL-based ingest).
  if (options?.sourceUrl) {
    frontmatter.source_url = options.sourceUrl;
  }

  // Build the structured sources[] provenance entry for this ingest.
  const sourceType = options?.sourceType
    ?? (options?.sourceUrl ? "url" : "text");
  const sourceUrl = options?.sourceUrl ?? "text-paste";
  const sourceEntry = buildSourceEntry(sourceUrl, sourceType, options?.triggeredBy);
  frontmatter.sources = serializeSources([sourceEntry]);

  // Apply tags from options (will be merged with existing tags below for re-ingests).
  if (options?.tags && options.tags.length > 0) {
    frontmatter.tags = options.tags;
  }

  const existing = await readWikiPageWithFrontmatter(slug);
  if (existing) {
    const existingCreated = existing.frontmatter.created;
    if (typeof existingCreated === "string" && existingCreated !== "") {
      frontmatter.created = existingCreated;
    }
    const prevCountRaw = existing.frontmatter.source_count;
    const prevCount =
      typeof prevCountRaw === "number"
        ? prevCountRaw
        : typeof prevCountRaw === "string"
          ? Number(prevCountRaw)
          : NaN;
    frontmatter.source_count = String(
      (Number.isFinite(prevCount) ? prevCount : 0) + 1,
    );
    if (Array.isArray(existing.frontmatter.tags)) {
      // Merge existing tags with any new tags from options (deduplicated)
      const existingTags = existing.frontmatter.tags.filter(
        (t): t is string => typeof t === "string",
      );
      const newTags = options?.tags ?? [];
      const merged = [...new Set([...existingTags, ...newTags])];
      frontmatter.tags = merged;
    }
    // Preserve existing source_url if the new ingest doesn't provide one.
    if (
      !frontmatter.source_url &&
      typeof existing.frontmatter.source_url === "string" &&
      existing.frontmatter.source_url !== ""
    ) {
      frontmatter.source_url = existing.frontmatter.source_url;
    }

    // Merge structured sources[]: parse existing, update or append new entry.
    const existingSourcesRaw = existing.frontmatter.sources;
    const existingSources = parseSources(
      typeof existingSourcesRaw === "string"
        ? existingSourcesRaw
        : Array.isArray(existingSourcesRaw)
          ? existingSourcesRaw
          : undefined,
    );
    // Merge the new entry, superseding a stale "text-paste" placeholder.
    // (source_count is the ingest counter, set above — not the array length.)
    frontmatter.sources = serializeSources(mergeSourceEntry(existingSources, sourceEntry));

    // --- Phase 1 fields: preserve on re-ingest ---
    // Preserve authors from existing page (don't reset).
    if (Array.isArray(existing.frontmatter.authors)) {
      frontmatter.authors = existing.frontmatter.authors;
    }
    // Preserve owner (the original owner stays accountable).
    if (typeof existing.frontmatter.owner === "string" && existing.frontmatter.owner !== "") {
      frontmatter.owner = existing.frontmatter.owner;
    }
    // Preserve visibility (don't silently re-publish a private page).
    if (existing.frontmatter.visibility === "private") {
      frontmatter.visibility = "private";
    }
    // Don't change an existing page's scope on re-ingest: preserve its `type`
    // (or lack of one), so an agent ingest can't flip a public page into
    // agent-scope (out of the feed/search) by colliding on a slug.
    if (typeof existing.frontmatter.type === "string") {
      frontmatter.type = existing.frontmatter.type;
    } else {
      delete frontmatter.type;
    }
    // Append the acting identity to contributors if not already present.
    const existingContribs = Array.isArray(existing.frontmatter.contributors)
      ? existing.frontmatter.contributors
      : [];
    if (!existingContribs.includes(actor)) {
      frontmatter.contributors = [...existingContribs, actor];
    } else {
      frontmatter.contributors = existingContribs;
    }
    // Preserve disputed flag from existing.
    if (typeof existing.frontmatter.disputed === "boolean") {
      frontmatter.disputed = existing.frontmatter.disputed;
    }
    // Preserve supersedes from existing.
    if (typeof existing.frontmatter.supersedes === "string") {
      frontmatter.supersedes = existing.frontmatter.supersedes;
    }
    // Preserve aliases from existing.
    if (Array.isArray(existing.frontmatter.aliases)) {
      frontmatter.aliases = existing.frontmatter.aliases;
    }
    // Expiry resets to 90 days from now (re-ingest refreshes the page).
    // valid_from also resets to now (the page's information is re-verified).
    // (both already set above — no need to change)
    // Preserve confidence if existing was higher (manually set).
    const existingConf = existing.frontmatter.confidence;
    if (typeof existingConf === "number" && existingConf > 0.7) {
      frontmatter.confidence = existingConf;
    }
  }

  const contentWithFm = serializeFrontmatter(frontmatter, wikiContent);

  // 5. Hand off to the unified write pipeline. We pass the raw `content` as
  // `crossRefSource` so the LLM sees the full document when picking related
  // pages, matching the previous behaviour.
  const { updatedSlugs } = await writeWikiPageWithSideEffects({
    slug,
    title,
    content: contentWithFm,
    summary,
    logOp: "ingest",
    crossRefSource: content,
    author: actor,
    logDetails: ({ updatedSlugs }) =>
      `slug: ${slug} · updated ${updatedSlugs.length} related page(s)`,
  });

  // 6. Alias index is updated automatically by the lifecycle pipeline
  //    (writeWikiPageWithSideEffects → runPageLifecycleOp) — no caller-side
  //    call needed. The source index (URL/content-hash → slug) is caller-owned,
  //    so refresh it here for future dedup hits.
  updateSourceIndexForPage(
    slug,
    typeof frontmatter.source_url === "string" ? frontmatter.source_url : undefined,
    hash,
  );

  const result: IngestResult = {
    rawPath,
    primarySlug: slug,
    relatedUpdated: updatedSlugs,
    wikiPages: [slug, ...updatedSlugs],
    indexUpdated: true,
    ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
  };

  // 7. Persist a ledger entry recording this ingest operation.
  await persistToLedger({
    ingest_id: `${startedAt}/${slug}`,
    source_type: sourceType,
    source_url: sourceUrl,
    primary_slug: slug,
    related_slugs: updatedSlugs,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: "completed",
  });

  return result;
}
