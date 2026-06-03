import { NextRequest, NextResponse } from "next/server";
import { ingestImage } from "@/lib/ingest";
import type { IngestOptions } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { MAX_RESPONSE_SIZE } from "@/lib/constants";

/**
 * POST /api/ingest/image
 *
 * Ingest a single image — by URL (JSON) or file upload (multipart). The image
 * is stored as an asset, described by a vision model, and written as a wiki page
 * that embeds the image + description. Session-gated like /api/ingest.
 *
 *   JSON:      { imageUrl: string, title?: string, tags?: string[] }
 *   multipart: file=<blob>, title?=<string>, tags?=<comma-separated>
 */
export async function POST(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    // Attribution comes from the session, never the request body.
    const options: IngestOptions & { title?: string } = {
      author: principal.handle,
      owner: principal.handle,
      triggeredBy: principal.handle,
    };

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json(
          { error: "A non-empty 'file' is required." },
          { status: 400 },
        );
      }
      if (file.size > MAX_RESPONSE_SIZE) {
        return NextResponse.json(
          { error: `Image too large (max ${MAX_RESPONSE_SIZE} bytes).` },
          { status: 400 },
        );
      }
      const title = form.get("title");
      if (typeof title === "string" && title.trim()) options.title = title.trim();
      const tags = form.get("tags");
      if (typeof tags === "string" && tags.trim()) {
        options.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
      const bytes = await file.arrayBuffer();
      const result = await ingestImage({ bytes, filename: file.name }, options);
      return NextResponse.json(result);
    }

    // JSON path: { imageUrl, title?, tags? }
    const body = await request.json();
    const { imageUrl, title, tags } = body;
    if (typeof imageUrl !== "string" || !isUrl(imageUrl.trim())) {
      return NextResponse.json(
        { error: "imageUrl is required and must be a valid URL." },
        { status: 400 },
      );
    }
    if (typeof title === "string" && title.trim()) options.title = title.trim();
    if (Array.isArray(tags) && tags.every((t: unknown) => typeof t === "string")) {
      options.tags = tags;
    }
    const result = await ingestImage({ imageUrl: imageUrl.trim() }, options);
    return NextResponse.json(result);
  } catch (error) {
    const msg = getErrorMessage(error);
    // Bad-input failures from fetching/storing the image are the caller's fault.
    const clientError =
      /not an image|too large|Failed to fetch image|unsafe|blocked|private|Invalid/i.test(
        msg,
      );
    if (!clientError) logger.error("ingest", "Image ingest error", error);
    return NextResponse.json({ error: msg }, { status: clientError ? 400 : 500 });
  }
}
