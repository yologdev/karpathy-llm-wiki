/**
 * Agent task queue — the producer side.
 *
 * A durable queue of asynchronous agent work (Cloudflare Queues). Producers in
 * the main app enqueue {@link Task}s; a thin consumer worker
 * (`workers/task-consumer/`) drains the queue and POSTs each task back to the
 * main app's `/api/tasks/run` endpoint, where it executes with the full lib +
 * OpenNext context. See `yopedia-concept.md` / the task-queue plan.
 *
 * This module is the **producer**: `enqueueTask` sends to the `TASK_QUEUE`
 * binding when on the Workers runtime, and is a logged no-op off-Workers (local
 * dev, `next start`, vitest) — mirroring `getWorkersAiBinding` — so nothing
 * crashes where the binding is absent.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logger } from "./logger";

/**
 * A unit of asynchronous agent work. Discriminated by `kind` so the executor
 * (`/api/tasks/run`) can dispatch. Keep payloads small (ids/slugs, not bodies) —
 * Cloudflare Queues caps a message at 128 KB.
 */
export type Task =
  | {
      /** Reconcile a commons page from a human-flagged talk thread (B2b loop). */
      kind: "reconcile";
      slug: string;
      threadIndex: number;
      /** Handle of the human who asked yoyo to address it (attribution). */
      requestedBy?: string;
    }
  | {
      /** Async/batch ingestion (the queue is the scale path; interactive ingest
       *  stays synchronous). One of `url` or `content` must be set. */
      kind: "ingest";
      url?: string;
      title?: string;
      content?: string;
      owner?: string;
      author?: string;
      tags?: string[];
    }
  | {
      /** Autonomous maintenance, enqueued by the scan cron (Q2). `reconcile` a
       *  disputed page from its open thread; `staleness` re-ingest an expired
       *  page from its source; `fix` apply a deterministic lint auto-fix
       *  (`lintType`). `threadIndex` is required for `reconcile`; `lintType` for
       *  `fix`; `targetSlug` for `broken-link` (identifies which dead link to
       *  remove). */
      kind: "maintain";
      op: "reconcile" | "staleness" | "fix";
      slug: string;
      threadIndex?: number;
      lintType?: MaintainFixType;
      /** The target of a broken wiki link (for `broken-link` fixes). */
      targetSlug?: string;
    };

/** Deterministic, no-LLM lint fixes the maintenance scan may auto-apply. */
export type MaintainFixType =
  | "unmigrated-page"
  | "stale-index"
  | "supersedes-dangling"
  | "broken-link";

const MAINTAIN_FIX_TYPES = new Set<MaintainFixType>([
  "unmigrated-page",
  "stale-index",
  "supersedes-dangling",
  "broken-link",
]);

/** Minimal Cloudflare Queue producer binding — we only ever call `send`. */
interface QueueBinding {
  send(body: unknown): Promise<void>;
}

/**
 * Resolve the `TASK_QUEUE` producer binding (matches `queues.producers[].binding`
 * in wrangler.jsonc), or `null` when it isn't available
 * (off the Workers runtime, or the binding isn't bound). `getCloudflareContext`
 * throws outside the OpenNext request scope — expected in dev/tests.
 */
function getTaskQueue(): QueueBinding | null {
  let env: { TASK_QUEUE?: QueueBinding };
  try {
    ({ env } = getCloudflareContext() as { env: { TASK_QUEUE?: QueueBinding } });
  } catch {
    return null; // off-Workers — expected
  }
  const q = env.TASK_QUEUE;
  return q && typeof q.send === "function" ? q : null;
}

/**
 * Enqueue a task for asynchronous processing. Returns `true` when it was sent to
 * the queue, `false` when the queue is unavailable (off-Workers) — in which case
 * it's a logged no-op so callers (routes, dev, tests) never crash. Callers that
 * need the work to definitely happen should check the return value.
 */
export async function enqueueTask(task: Task): Promise<boolean> {
  const queue = getTaskQueue();
  if (!queue) {
    logger.info(
      "tasks",
      `TASK_QUEUE unavailable (off-Workers) — skipped enqueue of "${task.kind}"`,
    );
    return false;
  }
  await queue.send(task);
  logger.info("tasks", `enqueued task "${task.kind}"`);
  return true;
}

/**
 * Validate + narrow an untrusted JSON body into a {@link Task}, or `null` if it
 * isn't a well-formed task. Used by `/api/tasks/run` to reject malformed
 * messages as poison (4xx → DLQ) rather than retrying them forever.
 */
export function parseTask(body: unknown): Task | null {
  if (!body || typeof body !== "object") return null;
  const t = body as Record<string, unknown>;
  switch (t.kind) {
    case "reconcile":
      if (typeof t.slug !== "string" || t.slug.trim() === "") return null;
      if (typeof t.threadIndex !== "number" || !Number.isInteger(t.threadIndex)) {
        return null;
      }
      return {
        kind: "reconcile",
        slug: t.slug,
        threadIndex: t.threadIndex,
        ...(typeof t.requestedBy === "string"
          ? { requestedBy: t.requestedBy }
          : {}),
      };
    case "ingest": {
      const hasUrl = typeof t.url === "string" && t.url.trim() !== "";
      const hasContent = typeof t.content === "string" && t.content.trim() !== "";
      if (!hasUrl && !hasContent) return null; // need a source
      const tags =
        Array.isArray(t.tags) && t.tags.every((x) => typeof x === "string")
          ? (t.tags as string[])
          : undefined;
      return {
        kind: "ingest",
        ...(hasUrl ? { url: t.url as string } : {}),
        ...(typeof t.title === "string" ? { title: t.title } : {}),
        ...(hasContent ? { content: t.content as string } : {}),
        ...(typeof t.owner === "string" ? { owner: t.owner } : {}),
        ...(typeof t.author === "string" ? { author: t.author } : {}),
        ...(tags && tags.length > 0 ? { tags } : {}),
      };
    }
    case "maintain": {
      if (typeof t.slug !== "string" || t.slug.trim() === "") return null;
      // `reconcile` needs a thread to reconcile from.
      if (t.op === "reconcile") {
        if (typeof t.threadIndex !== "number" || !Number.isInteger(t.threadIndex)) {
          return null;
        }
        return { kind: "maintain", op: "reconcile", slug: t.slug, threadIndex: t.threadIndex };
      }
      if (t.op === "staleness") {
        return { kind: "maintain", op: "staleness", slug: t.slug };
      }
      // `fix` needs an allowed (deterministic) lint type.
      if (t.op === "fix") {
        if (!MAINTAIN_FIX_TYPES.has(t.lintType as MaintainFixType)) return null;
        const lintType = t.lintType as MaintainFixType;
        // `broken-link` additionally requires a targetSlug (which dead link to remove).
        if (lintType === "broken-link") {
          if (typeof t.targetSlug !== "string" || t.targetSlug.trim() === "") return null;
          return {
            kind: "maintain",
            op: "fix",
            slug: t.slug,
            lintType,
            targetSlug: t.targetSlug,
          };
        }
        return {
          kind: "maintain",
          op: "fix",
          slug: t.slug,
          lintType,
        };
      }
      return null;
    }
    default:
      return null;
  }
}
