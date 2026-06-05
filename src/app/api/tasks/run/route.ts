import { NextResponse } from "next/server";
import { getServicePrincipal } from "@/lib/auth";
import { parseTask } from "@/lib/tasks";
import { reconcileFromTalk } from "@/lib/reconcile";
import { ingest, ingestUrl, reingest } from "@/lib/ingest";
import { fixLintIssue } from "@/lib/lint-fix";
import { agentIdFor, DEFAULT_AGENT_NAME } from "@/lib/agents";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/tasks/run — execute one agent task.
 *
 * The SOLE caller is the task-consumer worker (`workers/task-consumer/`), which
 * drains the Cloudflare Queue and POSTs each message here with the service
 * token. Gated to {@link getServicePrincipal} only — never a human/Clerk session.
 *
 * Status contract (drives the consumer's ack/retry, which maps to CF Queues):
 *   - 2xx → done, ack the message.
 *   - 4xx → permanently-bad/poison task → ack + drop (don't retry; → DLQ on the
 *           consumer side if it chooses). Malformed body, or a missing page/thread.
 *   - 5xx → transient failure → the consumer retries (CF redelivers; DLQ after
 *           max_retries).
 *
 * Handlers are idempotent/retry-safe: reconcile re-reconciles harmlessly, ingest
 * dedups.
 */
export async function POST(req: Request) {
  // Service-token only.
  const principal = getServicePrincipal(req);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const task = parseTask(body);
  if (!task) {
    // Poison message — don't retry.
    return NextResponse.json({ error: "malformed task" }, { status: 400 });
  }

  try {
    if (task.kind === "reconcile") {
      // Attribute the edit to the requester's yoyo (the human who asked), else a
      // generic yoyo for autonomous/unknown triggers.
      const author = task.requestedBy
        ? agentIdFor(task.requestedBy, DEFAULT_AGENT_NAME)
        : undefined;
      const result = await reconcileFromTalk(task.slug, task.threadIndex, {
        author,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (task.kind === "maintain") {
      // Autonomous maintenance (Q2). Attributed to a generic yoyo (no requester).
      if (task.op === "reconcile") {
        if (typeof task.threadIndex !== "number") {
          return NextResponse.json(
            { error: "maintain:reconcile requires threadIndex" },
            { status: 400 },
          );
        }
        const result = await reconcileFromTalk(task.slug, task.threadIndex);
        return NextResponse.json({ ok: true, ...result });
      }
      if (task.op === "fix") {
        // Deterministic, no-LLM lint auto-fix (backfill defaults, drop dead refs).
        if (!task.lintType) {
          return NextResponse.json(
            { error: "maintain:fix requires lintType" },
            { status: 400 },
          );
        }
        const result = await fixLintIssue(task.lintType, task.slug, task.targetSlug);
        return NextResponse.json({ ok: true, ...result });
      }
      // op === "staleness": refresh an expired page from its source.
      const result = await reingest(task.slug, {
        author: DEFAULT_AGENT_NAME,
        triggeredBy: DEFAULT_AGENT_NAME,
      });
      return NextResponse.json({ ok: true, slug: result.primarySlug });
    }

    // kind === "ingest"
    const opts = {
      ...(task.owner ? { owner: task.owner } : {}),
      ...(task.author ? { author: task.author, triggeredBy: task.author } : {}),
      ...(task.tags && task.tags.length > 0 ? { tags: task.tags } : {}),
    };
    const result = task.url
      ? await ingestUrl(task.url, opts)
      : await ingest(task.title?.trim() || "Untitled", task.content ?? "", opts);
    return NextResponse.json({ ok: true, slug: result.primarySlug });
  } catch (err) {
    const message = getErrorMessage(err);
    // A missing page/thread is permanent → poison (4xx), don't retry forever.
    if (/not found/i.test(message)) {
      logger.warn("tasks", `task "${task.kind}" permanently failed: ${message}`);
      return NextResponse.json({ error: message }, { status: 422 });
    }
    // Otherwise transient (LLM hiccup, lock contention) → retry.
    logger.error("tasks", `task "${task.kind}" failed`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
