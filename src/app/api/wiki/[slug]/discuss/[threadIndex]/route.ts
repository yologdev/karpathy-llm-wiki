import { NextResponse } from "next/server";
import { getThread, resolveThread } from "@/lib/talk";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ slug: string; threadIndex: string }> };

/**
 * GET /api/wiki/[slug]/discuss/[threadIndex]
 *
 * Returns a single discussion thread by index.
 * Returns `{ thread: TalkThread }` or 404.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { slug, threadIndex } = await params;
    const idx = parseInt(threadIndex, 10);
    if (!Number.isFinite(idx) || idx < 0) {
      return NextResponse.json(
        { error: "threadIndex must be a non-negative integer" },
        { status: 400 },
      );
    }

    const thread = await getThread(slug, idx);
    if (!thread) {
      return NextResponse.json(
        { error: `thread ${idx} not found for page "${slug}"` },
        { status: 404 },
      );
    }

    return NextResponse.json({ thread });
  } catch (err) {
    logger.error("discuss get failed:", getErrorMessage(err));
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/wiki/[slug]/discuss/[threadIndex]
 *
 * Resolve or close a discussion thread.
 * Body: `{ status: "resolved" | "wontfix" }`
 * Returns `{ thread: TalkThread }`.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { slug, threadIndex } = await params;
    const idx = parseInt(threadIndex, 10);
    if (!Number.isFinite(idx) || idx < 0) {
      return NextResponse.json(
        { error: "threadIndex must be a non-negative integer" },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }

    const { status } = body as Record<string, unknown>;
    if (status !== "resolved" && status !== "wontfix") {
      return NextResponse.json(
        { error: 'status must be "resolved" or "wontfix"' },
        { status: 400 },
      );
    }

    const thread = await resolveThread(slug, idx, status);
    return NextResponse.json({ thread });
  } catch (err) {
    const message = getErrorMessage(err);
    // resolveThread throws if thread index is out of bounds
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    logger.error("discuss resolve failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
