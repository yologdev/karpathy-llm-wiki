import { NextRequest, NextResponse } from "next/server";
import { ingest, ingestUrl } from "@/lib/ingest";
import type { IngestOptions } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { ClientInputError, getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    // Writes require an authenticated user (also enforced in middleware for
    // Clerk sessions). Service tokens (scheduled agent jobs) are accepted as a
    // fallback — the acting identity comes from the session or token, never
    // from the request body.
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await request.json();

    const { url, title, content, preview, generatedContent, triggeredBy, tags, sourceUrl, sourceType } = body;

    // Validate triggeredBy if provided
    if (triggeredBy !== undefined && typeof triggeredBy !== "string") {
      return NextResponse.json(
        { error: "triggeredBy must be a string if provided" },
        { status: 400 },
      );
    }

    // Validate sourceType if provided (preserves provenance when the
    // PDF/image review flow commits the approved body via this text path).
    const VALID_SOURCE_TYPES = ["url", "text", "x-mention", "image", "pdf", "youtube"];
    if (sourceType !== undefined && !VALID_SOURCE_TYPES.includes(sourceType)) {
      return NextResponse.json(
        { error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(", ")}` },
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
    if (typeof sourceType === "string" && sourceType.length > 0) {
      options.sourceType = sourceType as IngestOptions["sourceType"];
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

    // Text path: content is required; title is OPTIONAL — when omitted, ingest()
    // derives it from the content (or the synthesized concept).
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
    if (title !== undefined && typeof title !== "string") {
      return NextResponse.json(
        { error: "title must be a string if provided" },
        { status: 400 },
      );
    }

    const result = await ingest(
      typeof title === "string" ? title.trim() : "",
      content.trim(),
      options,
    );

    return NextResponse.json(result);
  } catch (error) {
    const msg = getErrorMessage(error);
    // Bad-input failures (e.g. a deleted/private X post, an unsafe URL) are
    // tagged ClientInputError → 400 + warn. Anything else is a real server
    // failure → 500 + error log, so genuine bugs aren't buried as 500 noise.
    if (error instanceof ClientInputError) {
      logger.warn("ingest", `Ingest rejected: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    logger.error("ingest", "Ingest error", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
