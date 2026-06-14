import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { decodeSlug } from "@/lib/slugify";
import {
  readWikiPageWithFrontmatter,
  tenantForOwner,
  validateSlug,
} from "@/lib/wiki";
import { commonsPath } from "@/lib/links";
import { belongsInCommons } from "@/lib/commons";
import { commonsRedirectForMissing } from "@/lib/page-redirect";
import { hasOpenThread } from "@/lib/talk";
import { ArticleView } from "@/components/ArticleView";

interface PublicWikiPageProps {
  params: Promise<{ slug: string }>;
}

/** Narrow a page's frontmatter to the commons predicate's expected shape. */
function isPublicCommons(fm: {
  visibility?: unknown;
  type?: unknown;
}): boolean {
  return belongsInCommons({
    visibility: typeof fm.visibility === "string" ? fm.visibility : undefined,
    type: typeof fm.type === "string" ? fm.type : undefined,
  });
}

/**
 * Metadata for the GLOBAL public commons URL `/wiki/<slug>`. Returns the neutral
 * "Page not found" title when the page is missing OR is NOT a public commons
 * page — so a private page's existence is never leaked via metadata. Canonical /
 * OG point at `/wiki/<slug>` (the global URL).
 */
export async function generateMetadata({
  params,
}: PublicWikiPageProps): Promise<Metadata> {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  // Missing, or not a PUBLIC commons page → neutral title (no existence oracle).
  if (!page || !isPublicCommons(page.frontmatter)) {
    return { title: "Page not found" };
  }
  const description =
    typeof page.frontmatter.summary === "string"
      ? page.frontmatter.summary
      : undefined;
  const url = commonsPath(slug);
  return {
    title: page.title, // layout template appends " · yopedia"
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: page.title,
      ...(description ? { description } : {}),
      url,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: page.title,
      ...(description ? { description } : {}),
    },
  };
}

/**
 * The GLOBAL public commons page `/wiki/<slug>`.
 *
 * SECURITY INVARIANT: only PUBLIC commons pages are ever served here, and this
 * route is rendered with NO principal (context-free / cacheable). A private page
 * — or any slug that isn't a readable public commons page — 404s with the same
 * neutral "Page not found" UI. We DO NOT redirect a private slug to its
 * owner-scoped URL (that would confirm the page exists); we 404 it outright.
 */
export default async function PublicWikiPage({
  params,
}: PublicWikiPageProps) {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);

  // Never echo an invalid/traversal slug — 404 it (matches the old route's
  // behavior for bad slugs).
  try {
    validateSlug(slug);
  } catch {
    notFound();
  }

  const page = await readWikiPageWithFrontmatter(slug);

  // No page here — but a merged-away/renamed slug may alias to a survivor.
  // Forward only to a PUBLIC commons page (never a private one — no existence
  // oracle); otherwise fall through to the neutral 404.
  if (!page) {
    const redirectTo = await commonsRedirectForMissing(slug);
    if (redirectTo) permanentRedirect(redirectTo); // 308
  }

  // Missing OR not a public commons page → neutral 404. Crucially, a PRIVATE
  // page falls into this branch (it is not `belongsInCommons`) and so is
  // 404'd here WITHOUT being rendered and WITHOUT being redirected to a URL
  // that would confirm its existence.
  if (!page || !isPublicCommons(page.frontmatter)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/wiki"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Back to index
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Page not found</h1>
        <p className="mt-4 text-foreground/60">
          No wiki page exists for &ldquo;{slug}&rdquo;.
        </p>
      </main>
    );
  }

  // Public commons page → render context-free (principal = null), so backlinks
  // surface only PUBLIC pages and the render is identical for every viewer.
  const pageTenant = tenantForOwner(
    typeof page.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined,
  );
  // Only let the `disputed` banner claim "a reconciliation is open" when one is.
  // (hasOpenThread is fail-soft — a discuss-read error can't break the render.)
  const hasOpenReconciliation =
    page.frontmatter.disputed === true && (await hasOpenThread(slug));
  return (
    <ArticleView
      page={page}
      slug={slug}
      pageTenant={pageTenant}
      principal={null}
      hasOpenReconciliation={hasOpenReconciliation}
    />
  );
}
