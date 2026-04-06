import {
  saveRawSource,
  writeWikiPage,
  listWikiPages,
  updateIndex,
  appendToLog,
} from "./wiki";
import { callLLM, hasLLMKey } from "./llm";
import type { IngestResult } from "./types";

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/** Convert a title into a URL-safe slug (lowercase, hyphens, no special chars). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Fallback stub (no API key)
// ---------------------------------------------------------------------------

function generateFallbackPage(title: string, content: string): string {
  const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
  return `# ${title}\n\n## Summary\n\n${preview}\n\n## Raw Content\n\n${content}`;
}

// ---------------------------------------------------------------------------
// Ingest pipeline
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a wiki editor. Given a source document, generate a wiki article in markdown format.

Include:
- A title as a level-1 heading (# Title)
- A brief summary section (## Summary)
- Key points or takeaways (## Key Points)
- Notable entities, concepts, or terms worth remembering (## Concepts)

Output pure markdown and nothing else. Do not wrap in code fences.`;

/**
 * Ingest a source document into the wiki.
 *
 * 1. Generate a slug from the title
 * 2. Save the raw source
 * 3. Generate a wiki page via LLM (or fallback stub)
 * 4. Write the wiki page
 * 5. Update the index
 * 6. Append to the log
 */
export async function ingest(
  title: string,
  content: string,
): Promise<IngestResult> {
  const slug = slugify(title);

  // 1. Save raw source
  const rawPath = await saveRawSource(slug, content);

  // 2. Generate wiki page content
  let wikiContent: string;
  if (hasLLMKey()) {
    wikiContent = await callLLM(SYSTEM_PROMPT, content);
  } else {
    wikiContent = generateFallbackPage(title, content);
  }

  // 3. Write wiki page
  await writeWikiPage(slug, wikiContent);

  // 4. Update index
  const entries = await listWikiPages();
  // Only add if not already present
  if (!entries.some((e) => e.slug === slug)) {
    // Derive a short summary from the content (first sentence or first 100 chars)
    const firstLine = content.split(/[.\n]/)[0].trim();
    const summary =
      firstLine.length > 100 ? firstLine.slice(0, 100) + "..." : firstLine;
    entries.push({ title, slug, summary });
  }
  await updateIndex(entries);

  // 5. Log
  await appendToLog(`Ingested "${title}" as ${slug}`);

  return {
    rawPath,
    wikiPages: [slug],
    indexUpdated: true,
  };
}
