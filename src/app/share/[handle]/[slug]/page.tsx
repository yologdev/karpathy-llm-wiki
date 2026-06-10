import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, isArtifactType, tenantForOwner } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
import { canReadFrontmatter } from "@/lib/authz";
import { wikiUrlFor, str } from "@/lib/share-url";
import { parseSources, dedupeSourcesForDisplay, sourceLabel } from "@/lib/sources";
import { stripLeadingH1 } from "@/lib/markdown";
import type { SourceEntry } from "@/lib/types";
import { Colophon } from "@/components/folio/primitives";
import { HtmlPreview } from "@/components/HtmlPreview";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface ShareProps {
  params: Promise<{ handle: string; slug: string }>;
}

/** Citations at the bottom of a shared page. */
function SourcesFooter({ sources }: { sources: SourceEntry[] }) {
  if (sources.length === 0) return null;
  return (
    <section style={{ marginTop: 40 }}>
      <p className="fmark" style={{ marginBottom: 14 }}>
        Sources · {sources.length}
      </p>
      <ol className="stack" style={{ gap: 12, margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <span className="receipt" style={{ color: "var(--accent)", marginRight: 6 }}>
              [{i + 1}]
            </span>
            <span style={{ color: "var(--ink-2)" }}>{sourceLabel(s)}</span>
            {s.url && s.url !== "text-paste" && (
              <div
                className="receipt"
                style={{ fontSize: 11, color: "var(--faint)", marginTop: 3, wordBreak: "break-all" }}
              >
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--faint)" }}>
                  {s.url}
                </a>
                {s.fetched ? ` · fetched ${s.fetched}` : ""}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export async function generateMetadata({
  params,
}: ShareProps): Promise<Metadata> {
  const { handle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page || !canReadFrontmatter(page.frontmatter, await getPrincipal())) {
    return { title: "Shared page" };
  }
  // Validate handle matches the page's actual owner tenant to prevent misattribution
  const expectedTenant = tenantForOwner(str(page.frontmatter.owner));
  if (handle.toLowerCase() !== expectedTenant) {
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
  const { handle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);
  const principal = await getPrincipal();

  // Unreadable/missing → 404 (never reveal a private page exists).
  if (!page || !canReadFrontmatter(page.frontmatter, principal)) notFound();

  // Validate handle matches the page's actual owner tenant to prevent misattribution.
  const expectedTenant = tenantForOwner(str(page.frontmatter.owner));
  if (handle.toLowerCase() !== expectedTenant) notFound();

  const isHtml = isArtifactType(str(page.frontmatter.type));
  const wikiUrl = wikiUrlFor(slug, page.frontmatter);
  const sources = dedupeSourcesForDisplay(
    parseSources(page.frontmatter.sources as string | string[] | undefined),
  );

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
        // A self-contained artifact fills the viewport exactly (header + frame =
        // 100dvh) so there's no page scrollbar; its sources stay one click away
        // via "Open in wiki" rather than forcing a scroll past the full frame.
        <HtmlPreview html={page.body} bare />
      ) : (
        <main
          style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 18 }}>
            {page.title || slug}
          </h1>
          {/* Strip the body's own leading H1 — the title above already shows it. */}
          <MarkdownRenderer content={stripLeadingH1(page.body)} />
          <SourcesFooter sources={sources} />
        </main>
      )}
    </div>
  );
}
