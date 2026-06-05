import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { decodeSlug, slugify } from "@/lib/slugify";
import {
  readWikiPageWithFrontmatter,
  findBacklinks,
  tenantForOwner,
  buildSlugTenantMap,
} from "@/lib/wiki";
import {
  pagePath,
  editPath,
  rawPath,
  resolveSlugPath,
} from "@/lib/links";
import { parseSources } from "@/lib/sources";
import type { SourceEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { Icon } from "@/components/folio/icons";
import {
  Avatar,
  Mark,
  Confidence,
  Freshness,
} from "@/components/folio/primitives";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { DeletePageButton } from "@/components/DeletePageButton";
import { ReingestButton } from "@/components/ReingestButton";
import { ShareWithYoyoButton } from "@/components/ShareWithYoyoButton";
import { SaveToVaultButton } from "@/components/SaveToVaultButton";
import { getPrincipal } from "@/lib/auth";
import { canReadFrontmatter } from "@/lib/authz";
import { belongsInCommons } from "@/lib/commons";
import { isInVault } from "@/lib/vault";
import { agentIdFor, DEFAULT_AGENT_NAME } from "@/lib/agents";
import { RevisionHistory } from "@/components/RevisionHistory";
import { DiscussionPanel } from "@/components/DiscussionPanel";

interface WikiPageProps {
  params: Promise<{ handle: string; slug: string }>;
}

/**
 * Per-page Open Graph / Twitter metadata (net-new in P2 — the app only had a
 * global static title before). Private pages the viewer can't read get a
 * neutral title so existence isn't leaked. Sets the canonical owner-qualified
 * URL so shares/crawlers point at `/u/<tenant>/<slug>`.
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
  const url = pagePath(tenant, slug);
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

/** A single Table-of-Contents entry parsed from the markdown body. */
interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

/**
 * Reduce raw markdown heading text to the plain text the MarkdownRenderer
 * actually renders: `[label](url)`/`![alt](src)` collapse to their label, and
 * emphasis/code markers are dropped. Keeps TOC slugs in sync with the heading
 * anchors (which slugify the rendered text).
 */
function headingDisplayText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/**
 * Parse h2/h3 ATX headings into TOC items with unique ids (GitHub-style
 * `-2`, `-3` suffixes for repeats). Fenced code blocks are skipped so a
 * `## x` inside code isn't mistaken for a heading — keeping this list aligned
 * with what the renderer emits. The id array is handed to the renderer so the
 * heading anchors match these by construction.
 */
function buildToc(body: string): TocItem[] {
  const prose = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  const re = /^(#{2,3})\s+(.+?)\s*#*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prose)) !== null) {
    const text = headingDisplayText(m[2]);
    if (!text) continue;
    const base = slugify(text) || "section";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    items.push({
      level: m[1].length === 2 ? 2 : 3,
      text,
      id: n === 1 ? base : `${base}-${n}`,
    });
  }
  return items;
}

/** In-page Table of Contents. Hidden when there are too few headings. */
function TableOfContents({
  items,
  className,
}: {
  items: TocItem[];
  className?: string;
}) {
  if (items.length < 3) return null;
  return (
    <nav aria-label="On this page" className={className}>
      <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
        On this page
      </h2>
      <ul className="space-y-1.5 border-l border-border">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className={`block border-l border-transparent -ml-px py-0.5 text-muted hover:border-accent hover:text-accent transition-colors ${
                it.level === 3 ? "pl-6" : "pl-3"
              }`}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Remove the first H1 line so the promoted page title isn't duplicated. */
function stripLeadingH1(body: string): string {
  return body.replace(/^#\s+.+(?:\r?\n)?/m, "");
}

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

  // Slug→tenant map so in-content links and backlinks resolve to each target's
  // real owner (cross-owner links stay correct), falling back to this page's
  // tenant for dangling targets.
  const slugTenants = await buildSlugTenantMap();

  const backlinks = await findBacklinks(slug, principal);
  const hasSourceUrl =
    typeof page.frontmatter.source_url === "string" &&
    page.frontmatter.source_url.trim().length > 0;
  // A raw source exists for any ingested page (URL/text/image/x-mention). Used
  // to show the "View source" link; /raw/<slug> 404s gracefully otherwise.
  const hasRawSource =
    hasSourceUrl || Number(page.frontmatter.source_count ?? 0) > 0;

  // "Share with yoyo" is shown only to the page's owner/contributor, and we
  // pre-compute whether it's already shared into their yoyo.
  const pageOwner =
    typeof page.frontmatter.owner === "string" ? page.frontmatter.owner : "";
  const pageContributors = Array.isArray(page.frontmatter.contributors)
    ? (page.frontmatter.contributors as string[])
    : [];
  const canShare =
    !!principal &&
    (pageOwner === principal.handle ||
      pageContributors.includes(principal.handle));
  const myYoyoId = principal
    ? agentIdFor(principal.handle, DEFAULT_AGENT_NAME)
    : "";
  const alreadyShared =
    !!myYoyoId &&
    Array.isArray(page.frontmatter.sharedWith) &&
    (page.frontmatter.sharedWith as string[]).includes(myYoyoId);

  // "Save to vault" — curate a commons (public, non-agent) page into the signed-in
  // viewer's reference lens. Shown only on pages the viewer does NOT own or
  // contribute to (those are already in their vault); curation is for pulling in
  // OTHERS' commons pages.
  const isCommonsPage = belongsInCommons({
    visibility:
      typeof page.frontmatter.visibility === "string"
        ? page.frontmatter.visibility
        : undefined,
    type:
      typeof page.frontmatter.type === "string"
        ? page.frontmatter.type
        : undefined,
  });
  // canShare is true when the viewer owns or contributed to the page — those are
  // already in their vault, so the curate button is for everyone else's pages.
  const canCurate = !!principal && isCommonsPage && !canShare;
  const inVault = canCurate && (await isInVault(principal!.handle, slug));

  const lineageSources = parseSources(
    page.frontmatter.sources as string | string[] | undefined,
  );

  const toc = buildToc(page.body);
  const articleBody = stripLeadingH1(page.body);

  // ---- Folio header / provenance values (from real frontmatter) ----------
  const fm = page.frontmatter;
  const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
  const summary = typeof fm.summary === "string" ? fm.summary : "";
  const updatedRaw =
    typeof fm.updated === "string"
      ? fm.updated
      : typeof fm.created === "string"
        ? fm.created
        : null;
  const updatedRel = updatedRaw ? formatRelativeTime(updatedRaw) : null;
  const confidenceRaw = fm.confidence;
  const confidenceNum =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? confidenceRaw
      : typeof confidenceRaw === "string" && /^-?\d+(\.\d+)?$/.test(confidenceRaw)
        ? Number(confidenceRaw)
        : null;
  const expiry = typeof fm.expiry === "string" ? fm.expiry : null;
  const disputed = fm.disputed === true;
  // Written-by: owner first, then contributors — deduped, real handles only.
  const writtenBy = [pageOwner, ...pageContributors]
    .map((h) => (typeof h === "string" ? h.trim() : ""))
    .filter((h) => h && h !== "system")
    .filter((h, i, a) => a.indexOf(h) === i);

  // Provenance "stops" — only the ones we actually have data for.
  const provStops: { label: string; node: ReactNode }[] = [];
  if (writtenBy.length > 0) {
    provStops.push({
      label: "written by",
      node: (
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {writtenBy.map((id) => {
            const agent = id.includes("--");
            return (
              <span key={id} className="row" style={{ gap: 6 }}>
                <Avatar id={id} agent={agent} size={22} />
                <Mark id={id} agent={agent} />
              </span>
            );
          })}
        </div>
      ),
    });
  }
  if (confidenceNum !== null) {
    provStops.push({
      label: "confidence",
      node: <Confidence value={confidenceNum} withLabel />,
    });
  }
  if (expiry) {
    provStops.push({ label: "freshness", node: <Freshness expiry={expiry} /> });
  }
  if (updatedRel) {
    provStops.push({
      label: "updated",
      node: (
        <span
          className="receipt"
          style={{ fontSize: 13, color: "var(--muted)" }}
        >
          {updatedRel}
        </span>
      ),
    });
  }

  // Sources rail label: a readable host, or the paste sentinel.
  const sourceLabel = (s: SourceEntry): string => {
    if (!s.url || s.url === "text-paste") return "pasted text";
    try {
      return new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      return s.url;
    }
  };

  const askHref = `/query?q=${encodeURIComponent(`About "${page.title}": `)}`;

  return (
    <div className="fade">
      {/* breadcrumb */}
      <div className="shell" style={{ paddingTop: 30 }}>
        <div
          className="row receipt"
          style={{ gap: 8, fontSize: 12, color: "var(--muted)" }}
        >
          <Link href="/wiki" style={{ color: "var(--muted)" }}>
            commons
          </Link>
          <span style={{ color: "var(--faint)" }}>/</span>
          <span style={{ color: "var(--ink-2)" }}>{slug}</span>
        </div>
      </div>

      {/* header */}
      <header className="shell" style={{ paddingTop: 26, maxWidth: 1100 }}>
        {tags.length > 0 && (
          <div
            className="row"
            style={{ gap: 10, marginBottom: 18, flexWrap: "wrap" }}
          >
            {tags.map((t) => (
              <span
                key={t}
                className="receipt"
                style={{ fontSize: 11.5, color: "var(--accent)" }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
        <h1
          className="display"
          style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: 0, maxWidth: "20ch" }}
        >
          {page.title}
        </h1>
        {summary && (
          <p
            style={{
              fontFamily: "var(--font-read)",
              fontSize: 22,
              lineHeight: 1.5,
              letterSpacing: "-.015em",
              color: "var(--ink-2)",
              marginTop: 22,
              maxWidth: "var(--measure)",
            }}
          >
            {summary}
          </p>
        )}

        {provStops.length > 0 && (
          <div
            className="row"
            style={{
              gap: 0,
              marginTop: 30,
              flexWrap: "wrap",
              borderTop: "1px solid var(--rule)",
              borderBottom: "1px solid var(--rule)",
              padding: "16px 0",
            }}
          >
            {provStops.map((s, i) => (
              <div
                key={s.label}
                className="stack"
                style={{
                  gap: 7,
                  paddingRight: 32,
                  marginRight: 32,
                  borderRight:
                    i < provStops.length - 1 ? "1px solid var(--rule)" : "none",
                  marginBottom: 4,
                }}
              >
                <span className="fmark">{s.label}</span>
                {s.node}
              </div>
            ))}
          </div>
        )}

        {disputed && (
          <div
            className="row"
            style={{
              gap: 10,
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 10,
              background: "var(--rust-soft)",
              color: "var(--rust)",
              fontSize: 13.5,
              alignItems: "flex-start",
            }}
          >
            <span className="fresh warn" style={{ marginTop: 6 }} />
            <span>
              This page is <strong>disputed</strong> and low-confidence. A
              reconciliation is open on the discussion. Read with care.
            </span>
          </div>
        )}
      </header>

      {/* body + marginalia */}
      <section
        className="shell article-grid"
        style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 280px",
          gap: 56,
          alignItems: "start",
          maxWidth: 1100,
        }}
      >
        <div className="min-w-0">
          <article>
            <MarkdownRenderer
              content={articleBody}
              className="prose-article"
              headingIds={toc.map((t) => t.id)}
              tenant={pageTenant}
              slugTenants={slugTenants}
            />
          </article>

          {backlinks.length > 0 && (
            <section className="mt-10 border-t border-rule pt-6">
              <h2 className="fmark" style={{ color: "var(--faint)" }}>
                what links here
              </h2>
              <ul className="mt-3 space-y-1">
                {backlinks.map((bl) => (
                  <li key={bl.slug}>
                    <Link
                      href={resolveSlugPath(bl.slug, slugTenants, pageTenant)}
                      className="text-sm"
                      style={{ color: "var(--accent)" }}
                    >
                      {bl.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DiscussionPanel slug={slug} />
          <RevisionHistory slug={slug} />

          <div className="mt-12 border-t border-rule pt-6 flex flex-wrap items-center gap-3">
            <Link href={editPath(pageTenant, slug)} className="btn">
              Edit page
            </Link>
            {hasRawSource && (
              <Link href={rawPath(pageTenant, slug)} className="btn">
                View source
              </Link>
            )}
            {hasSourceUrl && <ReingestButton slug={slug} />}
            {canCurate && (
              <SaveToVaultButton slug={slug} initiallyInVault={inVault} />
            )}
            {canShare && (
              <ShareWithYoyoButton slug={slug} initiallyShared={alreadyShared} />
            )}
            <DeletePageButton slug={slug} />
          </div>
        </div>

        {/* marginalia rail — sources, ask, contents */}
        <aside
          className="article-margin"
          style={{
            position: "sticky",
            top: 92,
            borderLeft: "1px solid var(--rule)",
            paddingLeft: 28,
          }}
        >
          {lineageSources.length > 0 && (
            <>
              <p className="fmark" style={{ marginBottom: 16 }}>
                sources · {lineageSources.length}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {lineageSources.map((r, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      paddingLeft: 14,
                      borderLeft: "2px solid transparent",
                    }}
                  >
                    <span
                      className="receipt"
                      style={{ color: "var(--accent)", marginRight: 6 }}
                    >
                      [{i + 1}]
                    </span>
                    <span style={{ color: "var(--ink-2)" }}>{sourceLabel(r)}</span>
                    <div
                      className="receipt"
                      style={{
                        fontSize: 10.5,
                        color: "var(--faint)",
                        marginTop: 4,
                        wordBreak: "break-all",
                      }}
                    >
                      {r.url && r.url !== "text-paste" ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--faint)" }}
                        >
                          <Icon.link
                            width="10"
                            height="10"
                            style={{ verticalAlign: "-1px", marginRight: 4 }}
                          />
                          {r.url}
                        </a>
                      ) : (
                        <span>
                          <Icon.link
                            width="10"
                            height="10"
                            style={{ verticalAlign: "-1px", marginRight: 4 }}
                          />
                          text paste
                        </span>
                      )}
                      {r.fetched ? ` · fetched ${r.fetched}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="rule" style={{ margin: "24px 0" }} />
            </>
          )}

          <Link
            href={askHref}
            className="btn"
            style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
          >
            <Icon.spark width="15" height="15" /> Ask about this page
          </Link>

          <div className="rule" style={{ margin: "24px 0" }} />
          <TableOfContents items={toc} />
        </aside>
      </section>
    </div>
  );
}
