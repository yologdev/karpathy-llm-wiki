import { NextRequest, NextResponse } from "next/server";
import { hasLLMKey, callLLMStream } from "@/lib/llm";
import { listWikiPages } from "@/lib/wiki";
import {
  selectPagesForQuery,
  buildContext,
  buildQuerySystemPrompt,
  type QueryFormat,
} from "@/lib/query";
import { resolveScope } from "@/lib/search";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

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

    // Validate `format` if present; default to "prose" when missing.
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
    const queryFormat: QueryFormat = format === "table" ? "table" : format === "slides" ? "slides" : "prose";

    // Validate `scope` if present — must be a string.
    if (scope !== undefined && typeof scope !== "string") {
      return NextResponse.json(
        { error: "scope must be a string (e.g. 'agent:yoyo')" },
        { status: 400 },
      );
    }

    // Resolve scope to a set of slugs when provided
    let scopeSlugs: string[] | undefined;
    if (scope) {
      const resolved = await resolveScope(scope);
      if (!resolved) {
        return NextResponse.json(
          { error: `Invalid scope or agent not found: '${scope}'` },
          { status: 400 },
        );
      }
      scopeSlugs = resolved.slugs;
      if (scopeSlugs.length === 0) {
        return NextResponse.json(
          { error: `No pages found for scope '${scope}'` },
          { status: 400 },
        );
      }
    }

    const trimmedQuestion = question.trim();
    const entries = await listWikiPages();

    // Empty wiki — nothing to query
    if (entries.length === 0) {
      return NextResponse.json(
        {
          error:
            "The wiki is empty. Please ingest some content first so I have something to answer from.",
        },
        { status: 400 },
      );
    }

    if (!hasLLMKey()) {
      return NextResponse.json(
        {
          error:
            "No API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another provider key.",
        },
        { status: 500 },
      );
    }

    // Select relevant pages and build context (same logic as query())
    const selectedSlugs = await selectPagesForQuery(trimmedQuestion, entries, scopeSlugs);
    const { context, slugs: loadedSlugs } =
      await buildContext(selectedSlugs);

    // Build the system prompt (same as non-streaming query)
    const systemPrompt = await buildQuerySystemPrompt(
      context,
      entries,
      selectedSlugs,
      queryFormat,
    );

    // Stream the LLM response
    const result = callLLMStream(systemPrompt, trimmedQuestion);

    return result.toTextStreamResponse({
      headers: {
        "X-Wiki-Sources": JSON.stringify(loadedSlugs),
      },
    });
  } catch (error) {
    logger.error("query", "Query stream error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
