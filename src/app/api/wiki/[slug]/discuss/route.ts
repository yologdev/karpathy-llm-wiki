import { NextResponse } from "next/server";
import { listThreads, createThread } from "@/lib/talk";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/wiki/[slug]/discuss
 *
 * Lists all discussion threads for a wiki page.
 * Returns `{ threads: TalkThread[] }` — empty array if none exist.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const threads = await listThreads(slug);
    return NextResponse.json({ threads });
  } catch (err) {
    logger.error("discuss list failed:", getErrorMessage(err));
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/wiki/[slug]/discuss
 *
 * Create a new discussion thread.
 * Body: `{ title: string, author: string, body: string }`
 * Returns `{ thread: TalkThread }` with status 201.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;

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

    const { title, author, body: threadBody } = body as Record<string, unknown>;

    if (typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title must be a non-empty string" },
        { status: 400 },
      );
    }
    if (typeof author !== "string" || author.trim().length === 0) {
      return NextResponse.json(
        { error: "author must be a non-empty string" },
        { status: 400 },
      );
    }
    if (typeof threadBody !== "string" || threadBody.trim().length === 0) {
      return NextResponse.json(
        { error: "body must be a non-empty string" },
        { status: 400 },
      );
    }

    const thread = await createThread(slug, title.trim(), author.trim(), threadBody.trim());
    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    logger.error("discuss create failed:", getErrorMessage(err));
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
