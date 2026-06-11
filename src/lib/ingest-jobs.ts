/**
 * Status records for ASYNC ingest jobs (currently YouTube — see the queue path
 * in `/api/ingest`). A slow ingest is enqueued to the task queue instead of run
 * synchronously; this lets the UI poll the outcome ("done → here's your page" /
 * "failed → reason") rather than hanging the request. One JSON file per job under
 * `ingest-jobs/<jobId>.json`, owner-stamped so a status read can be gated.
 */

import { getStorage } from "./storage";
import { isEnoent } from "./errors";
import { logger } from "./logger";

export type IngestJobStatus = "queued" | "processing" | "done" | "failed";

/**
 * A job that's been `queued`/`processing` longer than this is treated as
 * `failed` ON READ — the consumer worker likely died mid-run (a long video can
 * hit the CPU limit) and would never write a terminal status, leaving the UI
 * polling "working…" forever. Generous: well past the client's ~5min poll cap
 * and any real ingest time, and the queue refreshes `updatedAt` on each retry,
 * so a job actively being retried is never falsely flagged.
 */
export const INGEST_JOB_STALE_MS = 10 * 60 * 1000;

/**
 * The status a reader should act on: a non-terminal job that hasn't advanced in
 * {@link INGEST_JOB_STALE_MS} is reported as `failed` (it stalled), so the UI
 * shows a reason and stops polling instead of waiting on a dead job forever.
 */
export function effectiveStatus(
  job: Pick<IngestJob, "status" | "updatedAt">,
): { status: IngestJobStatus; error?: string } {
  if (job.status === "queued" || job.status === "processing") {
    const age = Date.now() - Date.parse(job.updatedAt);
    if (Number.isFinite(age) && age > INGEST_JOB_STALE_MS) {
      return { status: "failed", error: "This ingest stalled — please try again." };
    }
  }
  return { status: job.status };
}

export interface IngestJob {
  jobId: string;
  /** The source URL being ingested. */
  url: string;
  /** Handle of the user who triggered it — only they may read the status. */
  owner: string;
  status: IngestJobStatus;
  /** Resulting page slug, once `done`. */
  slug?: string;
  /** Failure reason, once `failed`. */
  error?: string;
  /** Display title for the recent-ingests list (best-effort). */
  title?: string;
  createdAt: string;
  updatedAt: string;
}

/** jobIds are UUIDs; reject anything else so a crafted id can't escape the prefix. */
function relPathFor(jobId: string): string {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(jobId)) {
    throw new Error(`invalid ingest job id: ${jobId}`);
  }
  return `ingest-jobs/${jobId}.json`;
}

/** Create a job in the `queued` state. */
export async function createIngestJob(input: {
  jobId: string;
  url: string;
  owner: string;
  title?: string;
}): Promise<IngestJob> {
  const now = new Date().toISOString();
  const job: IngestJob = {
    jobId: input.jobId,
    url: input.url,
    owner: input.owner,
    title: input.title,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  await getStorage().writeFile(relPathFor(input.jobId), JSON.stringify(job));
  return job;
}

/** Read a job, or `null` if it doesn't exist. */
export async function getIngestJob(jobId: string): Promise<IngestJob | null> {
  try {
    const raw = await getStorage().readFile(relPathFor(jobId));
    return JSON.parse(raw) as IngestJob;
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/**
 * Merge a patch into an existing job and re-stamp `updatedAt`. No-op (returns
 * `null`) if the job is gone — a status update must never resurrect or partially
 * write a record.
 */
export async function updateIngestJob(
  jobId: string,
  patch: Partial<Pick<IngestJob, "status" | "slug" | "error" | "title">>,
): Promise<IngestJob | null> {
  const existing = await getIngestJob(jobId);
  if (!existing) {
    logger.warn("ingest-jobs", `updateIngestJob: job ${jobId} not found`);
    return null;
  }
  const updated: IngestJob = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await getStorage().writeFile(relPathFor(jobId), JSON.stringify(updated));
  return updated;
}
