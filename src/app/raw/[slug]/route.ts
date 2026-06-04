import { NextResponse, type NextRequest } from "next/server";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, tenantForOwner } from "@/lib/wiki";
import { rawPath } from "@/lib/links";

/** Legacy flat raw URL → true 308 to canonical `/u/<tenant>/raw/<slug>`. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  const owner =
    typeof page?.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined;
  return NextResponse.redirect(
    new URL(rawPath(tenantForOwner(owner), slug), req.url),
    308,
  );
}
