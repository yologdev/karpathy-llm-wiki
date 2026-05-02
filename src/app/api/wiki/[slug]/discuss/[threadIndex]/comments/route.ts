import { NextResponse } from "next/server";
import { addComment } from "@/lib/talk";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ slug: string; threadIndex: string }> };

/**
 * POST /api/wiki/[slug]/discuss/[threadIndex]/comments
 *
 * Add a comment to an existing discussion thread.
 * Body: `{ author: string, body: string, parentId?: string }`
 * Returns `{ comment: TalkComment }` with status 201.
 */
export async function POST(req: Request, { params }: RouteParams) {
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

    const { author, body: commentBody, parentId } = body as Record<string, unknown>;

    if (typeof author !== "string" || author.trim().length === 0) {
      return NextResponse.json(
        { error: "author must be a non-empty string" },
        { status: 400 },
      );
    }
    if (typeof commentBody !== "string" || commentBody.trim().length === 0) {
      return NextResponse.json(
        { error: "body must be a non-empty string" },
        { status: 400 },
      );
    }
    if (parentId !== undefined && typeof parentId !== "string") {
      return NextResponse.json(
        { error: "parentId must be a string if provided" },
        { status: 400 },
      );
    }

    const comment = await addComment(
      slug,
      idx,
      author.trim(),
      commentBody.trim(),
      typeof parentId === "string" ? parentId : undefined,
    );
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    const message = getErrorMessage(err);
    // addComment throws if thread index is out of bounds
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    logger.error("discuss comment failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
