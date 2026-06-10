import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, isArtifactType } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
import { canReadFrontmatter } from "@/lib/authz";
import { wikiUrlFor, str } from "@/lib/share-url";
import { Colophon } from "@/components/folio/primitives";
import { HtmlPreview } from "@/components/HtmlPreview";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface ShareProps {
  params: Promise<{ handle: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: ShareProps): Promise<Metadata> {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page || !canReadFrontmatter(page.frontmatter, await getPrincipal())) {
    return { title: "Shared page" };
  }
  const title = page.title || slug;
  const description = str(page.frontmatter.summary);
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Full-screen, chrome-less SHARE view of a page (the global nav/footer are
 * hidden on `/share/*` via {@link SiteChrome}). Just a minimal header (yopedia +
 * a link back to the wiki page) and the content filling the rest — an HTML
 * artifact renders in its sandboxed frame full-bleed; other pages render as
 * markdown. Read-gated identically to the owner-scoped page.
 */
export default async function SharePage({ params }: ShareProps) {
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  const principal = await getPrincipal();

  // Unreadable/missing → 404 (never reveal a private page exists).
  if (!page || !canReadFrontmatter(page.frontmatter, principal)) notFound();

  const isHtml = isArtifactType(str(page.frontmatter.type));
  const wikiUrl = wikiUrlFor(slug, page.frontmatter);

  return (
    <div className="stack" style={{ minHeight: "100dvh" }}>
      <header
        className="spread"
        style={{
          alignItems: "center",
          height: 56,
          padding: "0 18px",
          borderBottom: "1px solid var(--rule)",
          background: "var(--paper)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          className="row"
          style={{ gap: 9, textDecoration: "none", color: "var(--ink)" }}
        >
          <Colophon size={18} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>yopedia</span>
        </Link>
        <Link
          href={wikiUrl}
          className="receipt"
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          Open in wiki →
        </Link>
      </header>

      {isHtml ? (
        <HtmlPreview html={page.body} bare />
      ) : (
        <main
          style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 18 }}>
            {page.title || slug}
          </h1>
          <MarkdownRenderer content={page.body} />
        </main>
      )}
    </div>
  );
}
