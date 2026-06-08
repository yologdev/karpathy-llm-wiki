import { NextRequest, NextResponse } from "next/server";
import { reingest } from "@/lib/ingest";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { canReadFrontmatter, canWriteFrontmatter } from "@/lib/authz";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const body = await request.json();
    const { slug, preview, generatedContent } = body;

    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      return NextResponse.json(
        { error: "slug is required and must be a non-empty string" },
        { status: 400 },
      );
    }
    if (preview !== undefined && typeof preview !== "boolean") {
      return NextResponse.json(
        { error: "preview must be a boolean if provided" },
        { status: 400 },
      );
    }
    if (generatedContent !== undefined && typeof generatedContent !== "string") {
      return NextResponse.json(
        { error: "generatedContent must be a string if provided" },
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

    // Realm-aware write ACL: re-ingest rewrites the page. Denied → cloak: a
    // private page the caller can't read is 404 (no existence oracle); a
    // readable-but-unwritable page is 403.
    if (!canWriteFrontmatter(page.frontmatter, principal)) {
      return canReadFrontmatter(page.frontmatter, principal)
        ? NextResponse.json(
            { error: "You don't have permission to re-ingest this page." },
            { status: 403 },
          )
        : NextResponse.json(
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

    const result = await reingest(trimmedSlug, {
      author: principal.handle,
      triggeredBy: principal.handle,
      // `preview: true` synthesizes the draft without writing (review step);
      // `generatedContent` commits the reviewed draft.
      ...(preview === true ? { preview: true } : {}),
      ...(typeof generatedContent === "string" ? { generatedContent } : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("ingest", "Re-ingest error", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
