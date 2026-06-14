/**
 * Shared async-ingest dispatch for the ingest routes. Every interactive/API
 * ingest now creates a job, enqueues the work, and returns `{ queued, jobId }`
 * for the client to poll (`/api/ingest/status/[jobId]`). This helper centralizes
 * the enqueue + off-Workers inline fallback so the URL/text/PDF/image routes
 * don't each carry a copy (which would drift).
 */
import { NextResponse } from "next/server";
import { enqueueTask, type Task } from "./tasks";
import { updateIngestJob } from "./ingest-jobs";
import { getErrorMessage } from "./errors";

/**
 * Enqueue `task` and return `{ queued: true, jobId }`. When the queue is absent
 * (off-Workers — local dev / tests), run `inline()` synchronously and mark the
 * job `done` so the same poll-based client flow still resolves. If enqueue
 * THROWS after the job exists, mark it `failed` (so it can't show "working…"
 * forever) and rethrow as a 500.
 */
export async function enqueueOrInline(
  jobId: string,
  task: Task,
  inline: () => Promise<{ primarySlug: string }>,
): Promise<NextResponse> {
  let enqueued: boolean;
  try {
    enqueued = await enqueueTask(task);
  } catch (e) {
    await updateIngestJob(jobId, {
      status: "failed",
      error: getErrorMessage(e),
    }).catch(() => {});
    throw e;
  }
  if (enqueued) {
    return NextResponse.json({ queued: true, jobId });
  }
  const result = await inline();
  await updateIngestJob(jobId, { status: "done", slug: result.primarySlug });
  return NextResponse.json({ queued: true, jobId, slug: result.primarySlug });
}
