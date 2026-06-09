import { NextRequest, NextResponse } from "next/server";
import { saveAnswerToWiki } from "@/lib/query";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { title, content, sources, format } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Validate sources if provided — must be an array of strings
    let validatedSources: string[] | undefined;
    if (sources !== undefined) {
      if (
        Array.isArray(sources) &&
        sources.every((s: unknown) => typeof s === "string")
      ) {
        validatedSources = sources as string[];
      } else {
        return NextResponse.json(
          { error: "sources must be an array of strings (wiki page slugs)" },
          { status: 400 },
        );
      }
    }

    // An HTML answer is saved verbatim as a sandboxed, personal artifact owned by
    // the asker. Writes are middleware-gated to a signed-in user; if the principal
    // can't be resolved here (a transient auth failure) we must NOT silently write
    // a mis-attributed system-owned page — surface it. Other formats save as
    // markdown (unchanged, system-owned behavior).
    const isHtml = format === "html";
    let owner: string | undefined;
    if (isHtml) {
      const principal = await getPrincipal();
      if (!principal) {
        logger.error("query", "HTML save: could not resolve principal despite write-gate");
        return NextResponse.json(
          { error: "Could not resolve your account — sign in again and retry." },
          { status: 401 },
        );
      }
      owner = principal.handle;
    }

    const result = await saveAnswerToWiki(
      title.trim(),
      content.trim(),
      undefined,
      validatedSources,
      isHtml ? "html" : "markdown",
      owner,
    );

    return NextResponse.json({ slug: result.slug, success: true });
  } catch (error) {
    logger.error("query", "Save answer error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
