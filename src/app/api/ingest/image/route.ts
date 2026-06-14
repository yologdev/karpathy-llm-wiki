import { NextRequest, NextResponse } from "next/server";
import { ingestImage } from "@/lib/ingest";
import type { IngestOptions } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { createIngestJob } from "@/lib/ingest-jobs";
import { enqueueOrInline } from "@/lib/ingest-async";
import { stageBytes } from "@/lib/ingest-staging";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { ClientInputError, getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { MAX_RESPONSE_SIZE } from "@/lib/constants";

/**
 * POST /api/ingest/image
 *
 * Ingest a single image — by URL (JSON) or file upload (multipart). Both paths
 * are ASYNC: a job is created, the work is enqueued, and `{queued, jobId}` is
 * returned for the client to poll. URL images ride a `source:"image"` task;
 * uploaded bytes are staged to R2 first (queue messages cap at 128 KB).
 * Session-gated.
 *
 *   JSON:      { imageUrl: string, title?: string, tags?: string[] }
 *   multipart: file=<blob>, title?=<string>, tags?=<comma-separated>
 */
export async function POST(request: NextRequest) {
  try {
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
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

      const jobId = crypto.randomUUID();
      await createIngestJob({
        jobId,
        owner: principal.handle,
        title: options.title ?? file.name,
      });
      const key = await stageBytes(jobId, file.name, "image", bytes);
      return await enqueueOrInline(
        jobId,
        {
          kind: "ingest",
          owner: options.owner,
          author: options.author,
          ...(options.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
          ...(options.title ? { title: options.title } : {}),
          jobId,
          staged: {
            key,
            kind: "image",
            filename: file.name,
            ...(file.type ? { contentType: file.type } : {}),
          },
        },
        () =>
          ingestImage(
            { bytes, filename: file.name, contentType: file.type || undefined },
            options,
          ),
      );
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
    const trimmedUrl = imageUrl.trim();

    const jobId = crypto.randomUUID();
    await createIngestJob({
      jobId,
      url: trimmedUrl,
      owner: principal.handle,
      title: options.title,
    });
    return await enqueueOrInline(
      jobId,
      {
        kind: "ingest",
        url: trimmedUrl,
        source: "image",
        owner: options.owner,
        author: options.author,
        ...(options.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
        ...(options.title ? { title: options.title } : {}),
        jobId,
      },
      () => ingestImage({ imageUrl: trimmedUrl }, options),
    );
  } catch (error) {
    const msg = getErrorMessage(error);
    // Bad-input failures (unsafe/oversized/non-image URL) are tagged
    // ClientInputError by the store helpers → 400. Anything else is a real
    // server failure → 500 + error log (always log so nothing is masked).
    if (error instanceof ClientInputError) {
      logger.warn("ingest", `Image ingest rejected: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    logger.error("ingest", "Image ingest error", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

