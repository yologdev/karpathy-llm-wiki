import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { getIngestJob } from "@/lib/ingest-jobs";
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
    } catch {
      // Malformed jobId (relPathFor throws) → treat as not found.
      job = null;
    }
    if (!job || job.owner !== principal.handle) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      status: job.status,
      slug: job.slug,
      error: job.error,
      url: job.url,
      title: job.title,
    });
  } catch (err) {
    logger.error("ingest", "ingest status error", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
