import { readWikiPage, listWikiPages, updateIndex, appendToLog } from "./wiki";
import { writeWikiPageWithSideEffects, deleteWikiPage } from "./lifecycle";
import { callLLM } from "./llm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a lint-fix operation. */
export interface FixResult {
  success: boolean;
  slug: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a required field is missing from the fix request. */
export class FixValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixValidationError";
  }
}

/** Thrown when a page required by the fix doesn't exist. */
export class FixNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Individual fix functions
// ---------------------------------------------------------------------------

/**
 * Fix an orphan-page lint issue by adding the page to the wiki index.
 *
 * Reads the page, extracts a summary, and writes it through the lifecycle
 * pipeline so that the index entry is created.
 */
export async function fixOrphanPage(slug: string): Promise<FixResult> {
  if (!slug) {
    throw new FixValidationError("Missing required field: slug");
  }

  const page = await readWikiPage(slug);
  if (!page) {
    throw new FixNotFoundError(`Page not found: ${slug}`);
  }

  // Extract summary from the first paragraph
  const summaryMatch = page.content.match(/^#\s+.+\n+(.+)/m);
  const summary = summaryMatch ? summaryMatch[1].slice(0, 120) : slug;

  await writeWikiPageWithSideEffects({
    slug,
    title: page.title,
    content: page.content,
    summary,
    logOp: "edit",
    logDetails: () => "auto-fix: added orphan page to index",
    crossRefSource: null,
  });

  return {
    success: true,
    slug,
    message: `Added ${slug} to index`,
  };
}

/**
 * Fix a stale-index lint issue by removing the stale entry from the index.
 *
 * If the slug is not found in the index, returns a no-op success result.
 */
export async function fixStaleIndex(slug: string): Promise<FixResult> {
  if (!slug) {
    throw new FixValidationError("Missing required field: slug");
  }

  const entries = await listWikiPages();
  const filtered = entries.filter((e) => e.slug !== slug);

  if (filtered.length === entries.length) {
    return {
      success: true,
      slug,
      message: `Entry for ${slug} not found in index — no changes needed`,
    };
  }

  await updateIndex(filtered);
  await appendToLog(
    "edit",
    slug,
    `auto-fix: removed stale index entry for ${slug}`,
  );

  return {
    success: true,
    slug,
    message: `Removed stale entry for ${slug} from index`,
  };
}

/**
 * Fix an empty-page lint issue by deleting the page entirely.
 */
export async function fixEmptyPage(slug: string): Promise<FixResult> {
  if (!slug) {
    throw new FixValidationError("Missing required field: slug");
  }

  await deleteWikiPage(slug);

  return {
    success: true,
    slug,
    message: `Deleted empty page ${slug}`,
  };
}

/**
 * Fix a missing-crossref lint issue by inserting a cross-reference link
 * from `slug` to `targetSlug`.
 *
 * If the link already exists, returns a no-op success result.
 * If no `## Related` section exists, creates one at the end of the page.
 */
export async function fixMissingCrossRef(
  slug: string,
  targetSlug: string,
): Promise<FixResult> {
  if (!slug || !targetSlug) {
    throw new FixValidationError(
      "Missing required fields: slug and targetSlug",
    );
  }

  // Read the source page
  const sourcePage = await readWikiPage(slug);
  if (!sourcePage) {
    throw new FixNotFoundError(`Source page not found: ${slug}`);
  }

  // Read the target page to get its title
  const targetPage = await readWikiPage(targetSlug);
  if (!targetPage) {
    throw new FixNotFoundError(`Target page not found: ${targetSlug}`);
  }

  // Build the cross-reference link
  const link = `[${targetPage.title}](${targetSlug}.md)`;

  // Check if the link already exists (avoid duplicates)
  if (sourcePage.content.includes(`(${targetSlug}.md)`)) {
    return {
      success: true,
      slug,
      message: `Page already links to ${targetSlug}.md — no changes needed`,
    };
  }

  // Append the link to a ## Related section
  let updatedContent: string;
  const relatedHeadingRe = /^## Related\b.*$/m;
  const relatedMatch = relatedHeadingRe.exec(sourcePage.content);

  if (relatedMatch) {
    // Insert the link on the line after the heading.
    // Find the end of the Related section: either the next heading or EOF.
    const afterHeading = relatedMatch.index! + relatedMatch[0].length;
    const restAfterHeading = sourcePage.content.slice(afterHeading);

    // Find next heading (## or #) after the Related section
    const nextHeadingMatch = restAfterHeading.match(/\n(?=## )/);
    const insertPos = nextHeadingMatch
      ? afterHeading + nextHeadingMatch.index!
      : sourcePage.content.length;

    // Insert just before the next heading (or at EOF), with a blank line guard
    const before = sourcePage.content.slice(0, insertPos).trimEnd();
    const after = sourcePage.content.slice(insertPos);
    updatedContent = `${before}\n- ${link}${after ? `\n${after}` : "\n"}`;
  } else {
    // No Related section yet — append one at the end
    updatedContent = `${sourcePage.content.trimEnd()}\n\n## Related\n\n- ${link}\n`;
  }

  // Extract summary from the source page for the index entry
  const summaryMatch = sourcePage.content.match(/^#\s+.+\n+(.+)/m);
  const summary = summaryMatch ? summaryMatch[1].slice(0, 120) : slug;

  // Write via the lifecycle pipeline (handles index, log, embeddings)
  await writeWikiPageWithSideEffects({
    slug,
    title: sourcePage.title,
    content: updatedContent,
    summary,
    logOp: "edit",
    logDetails: () => `auto-fix: added cross-reference to ${targetSlug}.md`,
    crossRefSource: null, // skip cross-ref discovery — we're adding a specific link
  });

  return {
    success: true,
    slug,
    message: `Added cross-reference from ${slug}.md to ${targetSlug}.md`,
  };
}

/**
 * Fix a contradiction lint issue by calling the LLM to rewrite the first page
 * so it no longer conflicts with the second page.
 *
 * @param slug - The slug of the page to rewrite
 * @param targetSlug - The slug of the other page involved in the contradiction
 * @param message - The contradiction description from the linter
 */
export async function fixContradiction(
  slug: string,
  targetSlug: string,
  message: string,
): Promise<FixResult> {
  if (!slug || !targetSlug) {
    throw new FixValidationError(
      "Missing required fields: slug and targetSlug",
    );
  }

  const sourcePage = await readWikiPage(slug);
  if (!sourcePage) {
    throw new FixNotFoundError(`Source page not found: ${slug}`);
  }

  const otherPage = await readWikiPage(targetSlug);
  if (!otherPage) {
    throw new FixNotFoundError(`Target page not found: ${targetSlug}`);
  }

  const systemPrompt = `You are a wiki editor resolving contradictions between pages. You will be given two wiki pages and a description of the contradiction. Rewrite ONLY the first page to resolve the contradiction while preserving as much of its original content and structure as possible. Output only the full rewritten markdown for the first page — no explanation, no wrapping.`;

  const userMessage = `## Contradiction\n${message}\n\n## Page to rewrite: ${slug}.md\n\n${sourcePage.content}\n\n## Other page (do not rewrite): ${targetSlug}.md\n\n${otherPage.content}`;

  const rewritten = await callLLM(systemPrompt, userMessage);

  // Extract summary from the rewritten page for the index entry
  const summaryMatch = rewritten.match(/^#\s+.+\n+(.+)/m);
  const summary = summaryMatch ? summaryMatch[1].slice(0, 120) : slug;

  await writeWikiPageWithSideEffects({
    slug,
    title: sourcePage.title,
    content: rewritten,
    summary,
    logOp: "edit",
    logDetails: () =>
      `auto-fix: resolved contradiction with ${targetSlug}.md`,
    crossRefSource: null,
  });

  return {
    success: true,
    slug,
    message: `Rewrote ${slug}.md to resolve contradiction with ${targetSlug}.md`,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a lint-fix request to the appropriate handler based on issue type.
 *
 * @throws {FixValidationError} for missing fields or unsupported types
 * @throws {FixNotFoundError} when a required page doesn't exist
 */
export async function fixLintIssue(
  type: string,
  slug: string,
  targetSlug?: string,
  message?: string,
): Promise<FixResult> {
  switch (type) {
    case "orphan-page":
      return fixOrphanPage(slug);
    case "stale-index":
      return fixStaleIndex(slug);
    case "empty-page":
      return fixEmptyPage(slug);
    case "missing-crossref":
      return fixMissingCrossRef(slug, targetSlug ?? "");
    case "contradiction":
      return fixContradiction(slug, targetSlug ?? "", message ?? "");
    default:
      throw new FixValidationError(
        "Auto-fix not supported for this issue type",
      );
  }
}
