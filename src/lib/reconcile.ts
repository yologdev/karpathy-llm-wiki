/**
 * Reconcile a commons page from a human-flagged discussion thread — the
 * "agents maintain, humans discuss" loop (B2b). A reader opens a talk thread
 * ("this claim is wrong", "these two pages are the same"), an agent (yoyo) reads
 * the page + the thread and revises the page to address the valid points,
 * flagging `disputed` when it can't resolve a contradiction. Triggered async via
 * the task queue (`/api/tasks/run` → here), never blocking the human's request.
 *
 * Reuses the ingest reconcile primitives (`parseDisputedMarker`,
 * `parseConceptMarker`, `extractSummary`) and the unified write path
 * (`writeWikiPageWithSideEffects`), so this stays consistent with how pages are
 * synthesized and how `disputed`/revisions/log all behave.
 */

import {
  readWikiPageWithFrontmatter,
  writeWikiPageWithSideEffects,
  serializeFrontmatter,
  type Frontmatter,
} from "./wiki";
import { extractSummary, parseDisputedMarker, parseConceptMarker } from "./ingest";
import { callLLM, hasLLMKey } from "./llm";
import { INGEST_MAX_OUTPUT_TOKENS } from "./constants";
import { getThread, addComment, resolveThread } from "./talk";
import { logger } from "./logger";

/** Default acting agent when no per-user yoyo handle is supplied. */
const DEFAULT_AGENT_AUTHOR = "yoyo";

const RECONCILE_FROM_TALK_SYSTEM_PROMPT = `You are a wiki editor maintaining a single canonical page. You are given the page's CURRENT content and a DISCUSSION thread in which readers have flagged issues (a wrong claim, a missing nuance, a request to merge/split, a question). Revise the page to address the VALID points raised.

Rules:
- Apply corrections and incorporate well-supported additions; keep the existing section structure (## Summary, ## Key Points, ## Concepts, ## Details) and any image markdown.
- Only change what the discussion justifies. Do NOT invent facts not supported by the page or the discussion, and do NOT remove substantive existing content unless the discussion shows it is wrong.
- Ignore off-topic chatter, opinions without support, and questions that don't imply a change.
- If the discussion raises a CONTRADICTION you cannot resolve from the available information, do not silently pick a side: keep both positions (attributing each) and begin your ENTIRE output with a single line, exactly:
DISPUTED: yes
  Otherwise do not emit a DISPUTED line.

Output the optional DISPUTED line, then the full revised page as pure markdown, and nothing else. Do not wrap in code fences.`;

export interface ReconcileFromTalkResult {
  slug: string;
  /** True when the page body actually changed. */
  changed: boolean;
  /** True when the reconcile surfaced an unresolved contradiction. */
  disputed: boolean;
}

/**
 * Reconcile `slug` against discussion thread `threadIndex`: read both, LLM-revise
 * the page to address the readers' valid points, write via the unified pipeline
 * (escalating `disputed`), then post a yoyo reply summarizing what changed and
 * resolve the thread (left open + `disputed` when unresolved).
 *
 * Idempotent and fail-soft: a missing page/thread or an empty LLM response makes
 * no change (the page is never blanked). Safe to re-run (queue redelivery).
 */
export async function reconcileFromTalk(
  slug: string,
  threadIndex: number,
  opts: { author?: string } = {},
): Promise<ReconcileFromTalkResult> {
  const author = opts.author?.trim() || DEFAULT_AGENT_AUTHOR;

  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) throw new Error(`reconcile: page "${slug}" not found`);

  const thread = await getThread(slug, threadIndex);
  if (!thread) throw new Error(`reconcile: thread ${threadIndex} not found on "${slug}"`);

  if (!hasLLMKey()) {
    logger.warn("reconcile", `no LLM configured — skipping reconcile of "${slug}"`);
    return { slug, changed: false, disputed: false };
  }

  // Build the reader-flagged-issues block from the thread.
  const discussion = [
    `## ${thread.title}`,
    ...thread.comments.map((c) => `**${c.author}**: ${c.body}`),
  ].join("\n\n");

  const user = `# Current page\n\n${page.body}\n\n# Discussion (reader-flagged issues)\n\n${discussion}`;
  const out = await callLLM(RECONCILE_FROM_TALK_SYSTEM_PROMPT, user, {
    maxOutputTokens: INGEST_MAX_OUTPUT_TOKENS,
  });

  // Fail-soft: never blank the page on an empty/failed response.
  if (!out || out.trim() === "") {
    logger.warn("reconcile", `empty LLM response — leaving "${slug}" unchanged`);
    return { slug, changed: false, disputed: false };
  }

  const { disputed, body: afterDisputed } = parseDisputedMarker(out);
  // Strip any echoed CONCEPT:/ALIASES: synthesis headers.
  const { body: newBody } = parseConceptMarker(afterDisputed);
  const changed = newBody.trim() !== page.body.trim();

  if (changed || disputed) {
    const fm: Frontmatter = { ...page.frontmatter };
    fm.updated = new Date().toISOString().slice(0, 10);
    if (disputed) fm.disputed = true; // escalate only
    const summary = extractSummary(newBody.replace(/^#\s+.+$/m, "").trim());

    await writeWikiPageWithSideEffects({
      slug,
      title: page.title,
      content: serializeFrontmatter(fm, changed ? newBody : page.body),
      summary,
      logOp: "edit",
      crossRefSource: null, // a reconcile isn't a new source for cross-ref
      author,
      logDetails: () =>
        `reconciled from discussion thread ${threadIndex}${disputed ? " (disputed)" : ""}`,
    });
  }

  // Reply in the thread (must precede resolve — resolved threads reject comments),
  // then resolve unless it ended disputed (leave it open for a human to weigh in).
  const reply = disputed
    ? "I reviewed this but found an unresolved contradiction — I've flagged the page as **disputed** and kept both views. Leaving this open for a human to settle."
    : changed
      ? "I've updated the page to address this. Thanks for flagging it."
      : "I reviewed this but didn't find a change the page needed. Reopen with more detail if you disagree.";
  try {
    await addComment(slug, threadIndex, author, reply);
    await resolveThread(slug, threadIndex, disputed ? "open" : "resolved");
  } catch (err) {
    // The page edit already succeeded; a thread-reply hiccup shouldn't fail the task.
    logger.warn("reconcile", `thread reply/resolve failed for "${slug}":`, err);
  }

  return { slug, changed, disputed };
}
