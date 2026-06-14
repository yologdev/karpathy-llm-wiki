import Link from "next/link";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { decodeSlug } from "@/lib/slugify";
import {
  readWikiPageWithFrontmatter,
  tenantForOwner,
} from "@/lib/wiki";
import { pagePath, commonsPath } from "@/lib/links";
import { getPrincipal } from "@/lib/auth";
import { canReadFrontmatter } from "@/lib/authz";
import { belongsInCommons } from "@/lib/commons";
import { ArticleView } from "@/components/ArticleView";
import { hasOpenThread } from "@/lib/talk";

interface WikiPageProps {
  params: Promise<{ handle: string; slug: string }>;
}

/**
 * Per-page Open Graph / Twitter metadata for the owner-scoped (private/owned)
 * URL. Private pages the viewer can't read get a neutral title so existence
 * isn't leaked.
 *
 * For PUBLIC commons pages the canonical + OG url point at the GLOBAL
 * `/wiki/<slug>`: the page-body `permanentRedirect` does NOT produce a true HTTP
 * redirect on OpenNext-Cloudflare (the public page renders at 200 here), so
 * pointing the canonical at the commons URL avoids duplicate-content/SEO issues.
 * Private/owned pages stay canonical at `/u/<tenant>/<slug>`.
 */
export async function generateMetadata({
  params,
}: WikiPageProps): Promise<Metadata> {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page || !canReadFrontmatter(page.frontmatter, await getPrincipal())) {
    // The layout's title template appends " · yopedia".
    return { title: "Page not found" };
  }
  const tenant = tenantForOwner(
    typeof page.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined,
  );
  const description =
    typeof page.frontmatter.summary === "string"
      ? page.frontmatter.summary
      : undefined;
  // Public commons pages are canonical at the global `/wiki/<slug>` (see the
  // function doc): point canonical + OG url there. Private pages canonical here.
  const inCommons = belongsInCommons({
    visibility:
      typeof page.frontmatter.visibility === "string"
        ? page.frontmatter.visibility
        : undefined,
    type:
      typeof page.frontmatter.type === "string"
        ? page.frontmatter.type
        : undefined,
  });
  const url = inCommons ? commonsPath(slug) : pagePath(tenant, slug);
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
 * The owner-scoped page route — now PRIVATE-ONLY. A PUBLIC commons page is
 * canonical at the global `/wiki/<slug>` (rendered context-free/cacheable with
 * no principal), so this route 308-redirects public pages there and only ever
 * RENDERS private/owned pages — behind a read-authorization check.
 */
export default async function WikiPageView({ params }: WikiPageProps) {
  const { handle: encodedHandle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  const principal = await getPrincipal();

  // A private page the viewer can't read is indistinguishable from a missing
  // one (same 404 UI) — never reveal that a private page exists.
  if (!page || !canReadFrontmatter(page.frontmatter, principal)) {
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

  // The page is addressed by slug (globally unique pre-P5); the handle segment
  // is the canonical owner. If the URL handle doesn't match the page's real
  // tenant (wrong owner, or stale/mixed-case), 308 to the canonical URL so
  // every page has one indexable address.
  const pageTenant = tenantForOwner(
    typeof page.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined,
  );
  if (decodeSlug(encodedHandle).toLowerCase() !== pageTenant) {
    permanentRedirect(pagePath(pageTenant, slug));
  }

  // PUBLIC commons pages live at the global, context-free `/wiki/<slug>` URL.
  // Send them there (308) so the owner-scoped form only ever renders the
  // private/owned pages below.
  if (
    belongsInCommons({
      visibility:
        typeof page.frontmatter.visibility === "string"
          ? page.frontmatter.visibility
          : undefined,
      type:
        typeof page.frontmatter.type === "string"
          ? page.frontmatter.type
          : undefined,
    })
  ) {
    permanentRedirect(commonsPath(slug));
  }

  // Private, readable page → render with the real principal (so its backlinks
  // include the viewer's own private pages).
  // Only let the `disputed` banner claim "a reconciliation is open" when one is.
  // (hasOpenThread is fail-soft — a discuss-read error can't break the render.)
  const hasOpenReconciliation =
    page.frontmatter.disputed === true && (await hasOpenThread(slug));
  return (
    <ArticleView
      page={page}
      slug={slug}
      pageTenant={pageTenant}
      principal={principal}
      hasOpenReconciliation={hasOpenReconciliation}
    />
  );
}
