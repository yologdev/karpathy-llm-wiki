import { NextRequest, NextResponse } from "next/server";
import { reingest } from "@/lib/ingest";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { getErrorMessage } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug } = body;

    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      return NextResponse.json(
        { error: "slug is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const trimmedSlug = slug.trim();

    // Check if page exists
    const page = await readWikiPageWithFrontmatter(trimmedSlug);
    if (!page) {
      return NextResponse.json(
        { error: `Page "${trimmedSlug}" not found` },
        { status: 404 },
      );
    }

    // Check if page has a source_url
    const sourceUrl = page.frontmatter.source_url;
    if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
      return NextResponse.json(
        { error: "Cannot re-ingest: no source URL recorded on this page" },
        { status: 422 },
      );
    }

    const result = await reingest(trimmedSlug);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Re-ingest error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
