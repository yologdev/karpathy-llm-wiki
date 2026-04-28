import { NextRequest, NextResponse } from "next/server";
import { ingest, ingestUrl } from "@/lib/ingest";
import type { IngestOptions } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { url, title, content, preview, generatedContent } = body;

    // Build ingest options from the request body
    const options: IngestOptions = {};
    if (preview === true) {
      options.preview = true;
    }
    if (typeof generatedContent === "string" && generatedContent.length > 0) {
      options.generatedContent = generatedContent;
    }

    // URL path takes precedence
    if (url && typeof url === "string" && isUrl(url.trim())) {
      const result = await ingestUrl(url.trim(), options);
      return NextResponse.json(result);
    }

    // Text path: require title + content
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title is required and must be a non-empty string (or provide a url)" },
        { status: 400 },
      );
    }

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string (or provide a url)" },
        { status: 400 },
      );
    }

    const result = await ingest(title.trim(), content.trim(), options);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("ingest", "Ingest error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
