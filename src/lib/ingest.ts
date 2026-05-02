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
import { fetchUrlContent, downloadImages } from "./fetch";
import type { IngestResult } from "./types";
import {
  serializeSources,
  parseSources,
  buildSourceEntry,
} from "./sources";
import {
  MAX_LLM_INPUT_CHARS,
} from "./constants";
import { slugify } from "./slugify";
import { loadPageConventions } from "./schema";
import { getRawDir } from "./config";


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
  const { title, content: rawContent } = await fetchUrlContent(url);
  // Download images referenced in the fetched content to local storage
  const slug = slugify(title);
  const content = await downloadImages(rawContent, slug, getRawDir());
  return ingest(title, content, { ...options, sourceUrl: url });
}

/**
 * Re-ingest a previously ingested wiki page by re-fetching its `source_url`.
 *
 * Reads the page's frontmatter to find the original URL, fetches fresh content,
 * and runs the standard ingest pipeline to update the page.
 *
 * @throws {Error} When the page doesn't exist or has no `source_url` in its frontmatter.
 */
export async function reingest(slug: string): Promise<IngestResult> {
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) {
    throw new Error(`Cannot re-ingest: page "${slug}" not found`);
  }

  const sourceUrl = page.frontmatter.source_url;
  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
    throw new Error("Cannot re-ingest: no source URL recorded");
  }

  const { title, content: rawContent } = await fetchUrlContent(sourceUrl);
  const content = await downloadImages(rawContent, slug, getRawDir());
  return ingest(title, content, { sourceUrl });
}

// ---------------------------------------------------------------------------
// Fallback stub (no API key)
// ---------------------------------------------------------------------------

function generateFallbackPage(title: string, content: string): string {
  const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
  return `# ${title}\n\n## Summary\n\n${preview}\n\n## Raw Content\n\n${content}`;
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
  const slug = slugify(title);

  if (slug === "") {
    throw new Error(
      "Cannot ingest: title produces an empty slug",
    );
  }

  const isPreview = options?.preview === true;
  const preGeneratedContent = options?.generatedContent;

  // 1. Generate wiki page content (or use pre-generated from preview)
  let wikiContent: string;
  if (preGeneratedContent) {
    // Commit-from-preview: skip the LLM, use the content the user approved
    wikiContent = preGeneratedContent;
  } else if (hasLLMKey()) {
    const systemPrompt = await buildIngestSystemPrompt();
    const chunks = chunkText(content, MAX_LLM_INPUT_CHARS);

    if (chunks.length === 1) {
      // Short content — single LLM call (no behaviour change)
      wikiContent = await callLLM(systemPrompt, chunks[0]);
    } else {
      // Long content — call LLM per chunk, merge results
      // First chunk produces the primary page structure
      wikiContent = await callLLM(systemPrompt, chunks[0]);

      // Subsequent chunks add supplemental content
      for (let i = 1; i < chunks.length; i++) {
        const continuation = await callLLM(
          CONTINUATION_SYSTEM_PROMPT,
          `# Existing article so far\n\n${wikiContent}\n\n# Additional source material (part ${i + 1} of ${chunks.length})\n\n${chunks[i]}`,
        );
        wikiContent += "\n\n" + continuation;
      }
    }
  } else {
    wikiContent = generateFallbackPage(title, content);
  }

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
  const frontmatter: Frontmatter = {
    created: now,
    updated: now,
    source_count: "1",
    tags: [],
    confidence: 0.7,
    expiry: expiryDate,
    authors: ["system"],
    contributors: [],
    disputed: false,
    supersedes: "",
    aliases: [],
  };

  // Persist the original source URL when provided (URL-based ingest).
  if (options?.sourceUrl) {
    frontmatter.source_url = options.sourceUrl;
  }

  // Build the structured sources[] provenance entry for this ingest.
  const sourceEntry = options?.sourceUrl
    ? buildSourceEntry(options.sourceUrl, "url")
    : buildSourceEntry("text-paste", "text");
  frontmatter.sources = serializeSources([sourceEntry]);

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
      frontmatter.tags = existing.frontmatter.tags;
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
    // If the new source URL already has an entry, update its fetched date.
    // Otherwise append the new entry.
    const matchIdx = existingSources.findIndex(
      (s) => s.url === sourceEntry.url && s.type === sourceEntry.type,
    );
    if (matchIdx >= 0) {
      existingSources[matchIdx] = { ...existingSources[matchIdx], fetched: sourceEntry.fetched };
    } else {
      existingSources.push(sourceEntry);
    }
    frontmatter.sources = serializeSources(existingSources);

    // --- Phase 1 fields: preserve on re-ingest ---
    // Preserve authors from existing page (don't reset to ["system"]).
    if (Array.isArray(existing.frontmatter.authors)) {
      frontmatter.authors = existing.frontmatter.authors;
    }
    // Append "system" to contributors if not already present.
    const existingContribs = Array.isArray(existing.frontmatter.contributors)
      ? existing.frontmatter.contributors
      : [];
    if (!existingContribs.includes("system")) {
      frontmatter.contributors = [...existingContribs, "system"];
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
    // (already set above — no need to change)
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
    logDetails: ({ updatedSlugs }) =>
      `slug: ${slug} · updated ${updatedSlugs.length} related page(s)`,
  });

  return {
    rawPath,
    primarySlug: slug,
    relatedUpdated: updatedSlugs,
    wikiPages: [slug, ...updatedSlugs],
    indexUpdated: true,
    ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
  };
}
