/**
 * Reconcile a commons page from a human-flagged discussion thread — the
 * "agents maintain, humans discuss" loop (B2b). A reader opens a talk thread
 * ("this claim is wrong", "these two pages are the same"), an agent (yoyo) reads
 * the page + the thread and revises the page to address the valid points,
 * flagging `disputed` when it can't resolve a contradiction (and clearing it
 * when it does). Triggered async via
 * the task queue (`/api/tasks/run` → here), never blocking the human's request.
 *
 * Reuses the ingest reconcile primitives (`parseConceptMarker`,
 * `extractSummary`) and the unified write path
 * (`writeWikiPageWithSideEffects`), so this stays consistent with how pages are
 * synthesized and how `disputed`/revisions/log all behave. The `DISPUTED:`
 * verdict is parsed by the local tri-state `parseDisputedVerdict` (omit →
 * leave the flag unchanged) rather than ingest's binary `parseDisputedMarker`.
 */

import {
  readWikiPageWithFrontmatter,
  writeWikiPageWithSideEffects,
  serializeFrontmatter,
  type Frontmatter,
} from "./wiki";
import { extractSummary, parseConceptMarker } from "./ingest";
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
- The page may ALREADY be flagged disputed from an earlier unresolved contradiction. Judge the WHOLE revised page and begin your ENTIRE output with ONE verdict line:
    DISPUTED: yes   — an unresolved contradiction remains (raised here, or already present); keep both positions, attributing each.
    DISPUTED: no    — none remains / you resolved it (this clears the flag).
  Only if you are genuinely unsure, omit the line entirely — the current flag is then left unchanged.

Output the optional DISPUTED line, then the full revised page as pure markdown, and nothing else. Do not wrap in code fences.`;

export interface ReconcileFromTalkResult {
  slug: string;
  /** True when the page body actually changed. */
  changed: boolean;
  /** The page's `disputed` flag AFTER reconciling (set / cleared / preserved). */
  disputed: boolean;
}

/**
 * Parse the leading `DISPUTED: yes|no` verdict line (trailing rationale on the
 * line is tolerated, so "DISPUTED: yes — still conflicts" still reads as `yes`).
 * Returns the verdict — `true` (keep/flag), `false` (resolved/clear), or `null`
 * when no verdict line is present (→ leave the existing flag unchanged) — plus
 * the body with that line stripped. Requiring an explicit `no` to clear keeps a
 * malformed/forgotten marker from silently downgrading a genuine dispute.
 */
function parseDisputedVerdict(raw: string): {
  verdict: boolean | null;
  body: string;
} {
  const m = raw.match(
    /^﻿?\s*DISPUTED:[ \t]*(yes|true|no|false)\b[^\n]*(?:\r?\n|$)/i,
  );
  if (!m) return { verdict: null, body: raw };
  return {
    verdict: /^(yes|true)$/i.test(m[1]),
    body: raw.slice(m[0].length).replace(/^\s+/, ""),
  };
}

/**
 * Reconcile `slug` against discussion thread `threadIndex`: read both, LLM-revise
 * the page to address the readers' valid points, write via the unified pipeline
 * (setting `disputed` to the page-wide verdict — flag when a contradiction
 * remains, CLEAR when resolved, leave unchanged when the LLM gives no verdict),
 * then post a yoyo reply summarizing what changed and resolve the thread (left
 * open + `disputed` when a contradiction remains).
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

  const { verdict, body: afterDisputed } = parseDisputedVerdict(out);
  // Strip any echoed CONCEPT:/ALIASES: synthesis headers.
  const { body: newBody } = parseConceptMarker(afterDisputed);
  const changed = newBody.trim() !== page.body.trim();
  const wasDisputed = page.frontmatter.disputed === true;
  // Tri-state: an explicit verdict sets the flag; a SILENT response leaves it
  // unchanged. Requiring an explicit "no" to clear means a malformed/forgotten
  // marker can't silently downgrade a genuine dispute.
  const disputed = verdict ?? wasDisputed;

  // Write when the body changed OR the disputed flag must flip — so a reconcile
  // that RESOLVES the contradiction clears the banner even with no body change
  // (the old code only escalated, so the banner stuck forever).
  if (changed || disputed !== wasDisputed) {
    const fm: Frontmatter = { ...page.frontmatter };
    fm.updated = new Date().toISOString().slice(0, 10);
    fm.disputed = disputed;
    const finalBody = changed ? newBody : page.body;
    const summary = extractSummary(finalBody.replace(/^#\s+.+$/m, "").trim());

    await writeWikiPageWithSideEffects({
      slug,
      title: page.title,
      content: serializeFrontmatter(fm, finalBody),
      summary,
      logOp: "edit",
      crossRefSource: null, // a reconcile isn't a new source for cross-ref
      author,
      logDetails: () =>
        `reconciled from discussion thread ${threadIndex}${
          disputed ? " (disputed)" : wasDisputed ? " (dispute resolved)" : ""
        }`,
    });

    // Clearing a human-visible dispute is a high-consequence downgrade — log it
    // so a wrong-clear (an LLM mis-verdict) is auditable, not silent.
    if (wasDisputed && !disputed) {
      logger.info(
        "reconcile",
        `cleared disputed on "${slug}" (thread ${threadIndex}) — reconcile reports no remaining contradiction`,
      );
    }
  }

  // Reply in the thread (must precede resolve — resolved threads reject comments),
  // then resolve unless it ended disputed (leave it open for a human to weigh in).
  const reply = disputed
    ? "I reviewed this but found an unresolved contradiction — I've flagged the page as **disputed** and kept both views. Leaving this open for a human to settle."
    : wasDisputed
      ? "I reconciled the contradiction — the page reads consistently now, so I've cleared the **disputed** flag."
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
