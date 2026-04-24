import { NextResponse } from "next/server";
import {
  queryByFrontmatter,
  validateQuery,
  type DataviewQuery,
} from "@/lib/dataview";
import { getErrorMessage } from "@/lib/errors";

/**
 * POST /api/wiki/dataview
 *
 * Accepts a DataviewQuery body and returns matching wiki pages filtered and
 * sorted by frontmatter fields.
 *
 * Response: `{ results: DataviewResult[], total: number }`
 */
export async function POST(req: Request) {
  try {
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
        { error: "request body must be a JSON object" },
        { status: 400 },
      );
    }

    const query = body as DataviewQuery;

    // Validate the query — will throw on unknown ops, bad limits, etc.
    try {
      validateQuery(query);
    } catch (err) {
      return NextResponse.json(
        { error: getErrorMessage(err) },
        { status: 400 },
      );
    }

    const results = await queryByFrontmatter(query);

    return NextResponse.json({
      results,
      total: results.length,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
