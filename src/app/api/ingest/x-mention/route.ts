import { NextRequest, NextResponse } from "next/server";
import { ingestXMention } from "@/lib/ingest";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Pattern matching x.com or twitter.com post URLs. */
const X_URL_PATTERN = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, triggeredBy } = body;

    // --- Validate url ---
    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return NextResponse.json(
        { error: "url is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (!X_URL_PATTERN.test(url.trim())) {
      return NextResponse.json(
        { error: "url must be an x.com or twitter.com URL" },
        { status: 400 },
      );
    }

    // --- Validate triggeredBy ---
    if (
      !triggeredBy ||
      typeof triggeredBy !== "string" ||
      triggeredBy.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "triggeredBy is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const result = await ingestXMention(url.trim(), triggeredBy.trim());
    return NextResponse.json(result);
  } catch (error) {
    logger.error("ingest-x-mention", "X mention ingest error", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
