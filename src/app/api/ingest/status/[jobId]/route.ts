import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { getIngestJob, effectiveStatus } from "@/lib/ingest-jobs";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/ingest/status/<jobId> — poll an async ingest job's outcome.
 *
 * Owner-gated: a missing job AND a job owned by someone else both return 404, so
 * a job's existence is never leaked to a non-owner.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    let job;
    try {
      job = await getIngestJob(jobId);
    } catch (e) {
      // A malformed jobId (relPathFor throws) → 404; a real storage error must
      // NOT be masked as 404 — rethrow it to the 500 handler below.
      if (/invalid ingest job id/i.test(getErrorMessage(e))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
    if (!job || job.owner !== principal.handle) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // A stalled (dead-worker) job reads as failed so the UI stops waiting on it.
    const eff = effectiveStatus(job);
    return NextResponse.json({
      status: eff.status,
      slug: job.slug,
      error: eff.error ?? job.error,
      url: job.url,
      title: job.title,
    });
  } catch (err) {
    logger.error("ingest", "ingest status error", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
