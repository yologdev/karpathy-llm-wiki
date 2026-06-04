import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { decodeSlug } from "@/lib/slugify";
import {
  readWikiPageWithFrontmatter,
  tenantForOwner,
  validateSlug,
} from "@/lib/wiki";
import { editPath } from "@/lib/links";

/** Legacy flat edit URL → true 308 to canonical `/u/<tenant>/<slug>/edit`. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  try {
    validateSlug(slug);
  } catch {
    notFound();
  }
  const page = await readWikiPageWithFrontmatter(slug);
  const owner =
    typeof page?.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined;
  return NextResponse.redirect(
    new URL(editPath(tenantForOwner(owner), slug), req.url),
    308,
  );
}
