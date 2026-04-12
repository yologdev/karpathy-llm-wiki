import { NextRequest, NextResponse } from "next/server";
import { appendQuery, listQueries, markSaved } from "@/lib/query-history";

/**
 * GET /api/query/history?limit=20
 *
 * Returns recent query history entries, most recent first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      return NextResponse.json(
        { error: "limit must be a positive integer" },
        { status: 400 },
      );
    }

    const entries = await listQueries(limit);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Query history GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/query/history
 *
 * Append a new query to history, or mark an existing entry as saved.
 *
 * Body for appending:
 *   { question: string, answer: string, sources: string[] }
 *
 * Body for marking saved:
 *   { action: "markSaved", id: string, slug: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle markSaved action
    if (body.action === "markSaved") {
      const { id, slug } = body;
      if (!id || typeof id !== "string") {
        return NextResponse.json(
          { error: "id is required for markSaved" },
          { status: 400 },
        );
      }
      if (!slug || typeof slug !== "string") {
        return NextResponse.json(
          { error: "slug is required for markSaved" },
          { status: 400 },
        );
      }
      await markSaved(id, slug);
      return NextResponse.json({ success: true });
    }

    // Default: append a new query entry
    const { question, answer, sources } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "question is required and must be a non-empty string" },
        { status: 400 },
      );
    }
    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json(
        { error: "answer is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const entry = await appendQuery({
      question: question.trim(),
      answer: answer.trim(),
      sources: Array.isArray(sources) ? sources : [],
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ entry, success: true });
  } catch (error) {
    console.error("Query history POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
