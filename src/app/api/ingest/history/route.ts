import { NextRequest, NextResponse } from "next/server";
import { readLedger } from "@/lib/ingest";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/ingest/history?limit=50
 *
 * Returns recent ingest ledger entries as a JSON array, most recent first.
 * Requires authentication — source URLs are private activity metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      return NextResponse.json(
        { error: "limit must be a positive integer" },
        { status: 400 },
      );
    }

    const entries = await readLedger(limit);
    return NextResponse.json({ entries });
  } catch (error) {
    logger.error("ingest", "Ingest history GET error", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
