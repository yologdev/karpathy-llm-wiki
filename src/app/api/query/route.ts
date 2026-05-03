import { NextRequest, NextResponse } from "next/server";
import { query, type QueryFormat } from "@/lib/query";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

function parseFormat(value: unknown): QueryFormat {
  if (value === "table") return "table";
  if (value === "slides") return "slides";
  return "prose";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { question, format, scope } = body;

    if (
      !question ||
      typeof question !== "string" ||
      question.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "question is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Validate `format` if present; default to "prose" when missing/invalid.
    if (
      format !== undefined &&
      format !== "prose" &&
      format !== "table" &&
      format !== "slides"
    ) {
      return NextResponse.json(
        { error: "format must be 'prose', 'table', or 'slides'" },
        { status: 400 },
      );
    }

    // Validate `scope` if present — must be a string.
    if (scope !== undefined && typeof scope !== "string") {
      return NextResponse.json(
        { error: "scope must be a string (e.g. 'agent:yoyo')" },
        { status: 400 },
      );
    }

    const result = await query(
      question.trim(),
      parseFormat(format),
      scope || undefined,
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error("query", "Query error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
