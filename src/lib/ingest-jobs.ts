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
