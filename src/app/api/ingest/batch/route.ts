import { NextRequest, NextResponse } from "next/server";
import { ingestUrl } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { enqueueTask } from "@/lib/tasks";
import { MAX_BATCH_URLS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const body = await request.json();
    const { urls, tags } = body;

    // --- Validate input ------------------------------------------------
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "urls is required and must be a non-empty array of strings" },
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

    if (urls.length > MAX_BATCH_URLS) {
      return NextResponse.json(
        { error: `Too many URLs. Maximum batch size is ${MAX_BATCH_URLS}.` },
        { status: 400 },
      );
    }

    // Validate every URL upfront — reject the whole batch if any are bad
    const malformed: { index: number; url: unknown }[] = [];
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      if (typeof u !== "string" || !isUrl(u.trim())) {
        malformed.push({ index: i, url: u });
      }
    }

    if (malformed.length > 0) {
      return NextResponse.json(
        {
          error: "Some URLs are malformed. Fix them and retry the entire batch.",
          malformed,
        },
        { status: 400 },
      );
    }

    // --- Async mode: enqueue one ingest task per URL, return immediately ---
    // Opt-in via `async: true`. The queue (Cloudflare Queues) processes them in
    // the background — decoupled, retryable, rate-limited — so a big batch
    // doesn't hold the request open or hammer the LLM. Interactive batches keep
    // the streaming path below (the default).
    if (body.async === true) {
      let queued = 0;
      let failed = 0;
      for (let i = 0; i < urls.length; i++) {
        // Per-URL try/catch: a single send() rejection (backpressure, etc.)
        // must not abort the batch after partial enqueue — count it and report
        // honest totals rather than 500-ing with work already queued.
        try {
          const ok = await enqueueTask({
            kind: "ingest",
            url: (urls[i] as string).trim(),
            owner: principal.handle,
            author: principal.handle,
            ...(Array.isArray(tags) && tags.length > 0 ? { tags } : {}),
          });
          if (ok) queued++;
          else failed++;
        } catch (err) {
          logger.warn("ingest", `batch async enqueue failed for ${urls[i]}`, err);
          failed++;
        }
      }
      if (queued === 0) {
        // Nothing made it onto the queue (unavailable, or every send rejected).
        return NextResponse.json(
          { error: "Task queue unavailable — try the synchronous batch instead." },
          { status: 503 },
        );
      }
      return NextResponse.json({
        mode: "async",
        queued,
        total: urls.length,
        ...(failed > 0 ? { failed } : {}),
      });
    }

    // --- Stream NDJSON results as each URL completes (default) -----------
    const encoder = new TextEncoder();
    const ingestOptions = {
      ...(Array.isArray(tags) && tags.length > 0 ? { tags } : {}),
      author: principal.handle,
      owner: principal.handle,
      triggeredBy: principal.handle,
    };

    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < urls.length; i++) {
          const url = (urls[i] as string).trim();
          let line: string;

          try {
            const result = await ingestUrl(url, ingestOptions);
            line = JSON.stringify({ index: i, url, success: true, result });
          } catch (err) {
            const message = getErrorMessage(err, "Unknown error");
            line = JSON.stringify({
              index: i,
              url,
              success: false,
              error: message,
            });
          }

          controller.enqueue(encoder.encode(line + "\n"));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    logger.error("ingest", "Batch ingest error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
