import { NextRequest, NextResponse } from "next/server";
import { ingestPdf } from "@/lib/ingest";
import type { IngestOptions } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { ClientInputError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { MAX_PDF_SIZE } from "@/lib/constants";

/**
 * POST /api/ingest/pdf
 *
 * Ingest a PDF document — by URL (JSON) or file upload (multipart). The PDF
 * text is extracted, processed through the ingest pipeline, and written as a
 * wiki page. Session-gated like /api/ingest.
 *
 *   JSON:      { pdfUrl: string, title?: string, tags?: string[] }
 *   multipart: file=<blob>, title?=<string>, tags?=<comma-separated>
 */
export async function POST(request: NextRequest) {
  try {
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    // Attribution comes from the session, never the request body.
    const options: Omit<IngestOptions, "sourceType"> & { title?: string } = {
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
      if (file.size > MAX_PDF_SIZE) {
        return NextResponse.json(
          { error: `PDF too large (max ${MAX_PDF_SIZE / 1024 / 1024} MB).` },
          { status: 400 },
        );
      }
      const title = form.get("title");
      if (typeof title === "string" && title.trim()) options.title = title.trim();
      const tags = form.get("tags");
      if (typeof tags === "string" && tags.trim()) {
        options.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
      if (form.get("preview") === "true") options.preview = true;
      const bytes = await file.arrayBuffer();
      const result = await ingestPdf(
        { bytes, filename: file.name },
        options,
      );
      return NextResponse.json(result);
    }

    // JSON path: { pdfUrl, title?, tags?, preview? }
    const body = await request.json();
    const { pdfUrl, title, tags, preview } = body;
    if (typeof pdfUrl !== "string" || !isUrl(pdfUrl.trim())) {
      return NextResponse.json(
        { error: "pdfUrl is required and must be a valid URL." },
        { status: 400 },
      );
    }
    if (typeof title === "string" && title.trim()) options.title = title.trim();
    if (Array.isArray(tags) && tags.every((t: unknown) => typeof t === "string")) {
      options.tags = tags;
    }
    if (preview === true) options.preview = true;
    const result = await ingestPdf({ pdfUrl: pdfUrl.trim() }, options);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred";
    if (error instanceof ClientInputError) {
      logger.warn("ingest", `PDF ingest rejected: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    logger.error("ingest", "PDF ingest error", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
