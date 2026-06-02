import { NextRequest, NextResponse } from "next/server";
import { ingest, ingestUrl } from "@/lib/ingest";
import type { IngestOptions } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    // Writes require an authenticated user (also enforced in middleware). The
    // acting identity comes from the session — never from the request body.
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await request.json();

    const { url, title, content, preview, generatedContent, triggeredBy, tags, sourceUrl } = body;

    // Validate triggeredBy if provided
    if (triggeredBy !== undefined && typeof triggeredBy !== "string") {
      return NextResponse.json(
        { error: "triggeredBy must be a string if provided" },
        { status: 400 },
      );
    }

    // Validate sourceUrl if provided (text path provenance — the URL path
    // records its own source automatically)
    if (sourceUrl !== undefined && (typeof sourceUrl !== "string" || !isUrl(sourceUrl.trim()))) {
      return NextResponse.json(
        { error: "sourceUrl must be a valid URL if provided" },
        { status: 400 },
      );
    }

    // Validate tags if provided
    if (tags !== undefined) {
      if (!Array.isArray(tags) || !tags.every((t: unknown) => typeof t === "string")) {
        return NextResponse.json(
          { error: "tags must be an array of strings if provided" },
          { status: 400 },
        );
      }
    }

    // Build ingest options from the request body
    const options: IngestOptions = {};
    if (preview === true) {
      options.preview = true;
    }
    if (typeof generatedContent === "string" && generatedContent.length > 0) {
      options.generatedContent = generatedContent;
    }
    if (typeof triggeredBy === "string" && triggeredBy.length > 0) {
      options.triggeredBy = triggeredBy;
    }
    if (Array.isArray(tags) && tags.length > 0) {
      options.tags = tags;
    }
    if (typeof sourceUrl === "string" && sourceUrl.trim().length > 0) {
      options.sourceUrl = sourceUrl.trim();
    }
    // Attribution from the authenticated session (authoritative; overrides any
    // client-supplied triggeredBy to prevent spoofing).
    options.author = principal.handle;
    options.owner = principal.handle;
    options.triggeredBy = principal.handle;

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
