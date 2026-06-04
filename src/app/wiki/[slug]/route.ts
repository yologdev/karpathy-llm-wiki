import { NextResponse, type NextRequest } from "next/server";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, tenantForOwner } from "@/lib/wiki";
import { pagePath } from "@/lib/links";

/**
 * Legacy flat page URL → 308 to the canonical owner-qualified
 * `/u/<tenant>/<slug>` (tenant-silos P2). Implemented as a Route Handler (not a
 * page) so it returns a TRUE HTTP 308: the OpenNext/Cloudflare runtime renders a
 * Server-Component `redirect()` as a `<meta refresh>` (200), whereas a Route
 * Handler's `NextResponse.redirect(url, 308)` is a real redirect crawlers honor.
 * The owner is resolved live from frontmatter so pages created after the
 * migration redirect too; a missing page resolves to the default tenant.
 */
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
    new URL(pagePath(tenantForOwner(owner), slug), req.url),
    308,
  );
}
