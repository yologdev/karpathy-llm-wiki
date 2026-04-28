import { NextRequest, NextResponse } from "next/server";
import { ingestUrl } from "@/lib/ingest";
import { isUrl } from "@/lib/fetch";
import { MAX_BATCH_URLS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    // --- Validate input ------------------------------------------------
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "urls is required and must be a non-empty array of strings" },
        { status: 400 },
      );
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

    // --- Stream NDJSON results as each URL completes --------------------
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < urls.length; i++) {
          const url = (urls[i] as string).trim();
          let line: string;

          try {
            const result = await ingestUrl(url);
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
    console.error("Batch ingest error:", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
