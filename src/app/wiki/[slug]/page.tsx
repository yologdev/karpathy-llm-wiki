import Link from "next/link";
import { decodeSlug, slugify } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, findBacklinks, type Frontmatter } from "@/lib/wiki";
import { parseSources } from "@/lib/sources";
import type { SourceEntry } from "@/lib/types";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { DeletePageButton } from "@/components/DeletePageButton";
import { ReingestButton } from "@/components/ReingestButton";
import { ShareWithYoyoButton } from "@/components/ShareWithYoyoButton";
import { getPrincipal } from "@/lib/auth";
import { agentIdFor, DEFAULT_AGENT_NAME } from "@/lib/agents";
import { RevisionHistory } from "@/components/RevisionHistory";
import { DiscussionPanel } from "@/components/DiscussionPanel";
import { AuthorBadges } from "@/components/AuthorBadges";
import { getDiscussionStats } from "@/lib/talk";
import type { DiscussionStats } from "@/lib/talk";

interface WikiPageProps {
  params: Promise<{ slug: string }>;
}

/** Truncate a date-ish string to its `YYYY-MM-DD` prefix (no library). */
function formatDate(value: string): string {
  return value.slice(0, 10);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a YYYY-MM-DD string as "May 2026". Returns the raw date on failure. */
function formatMonthYear(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value.slice(0, 10);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Map a numeric confidence score to a human-readable label + color class. */
function confidenceDisplay(value: number): {
  label: string;
  className: string;
} {
  if (value >= 0.7) {
    return {
      label: `Confidence: ${value}`,
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    };
  }
  if (value >= 0.3) {
    return {
      label: `Confidence: ${value}`,
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
  }
  return {
    label: `Confidence: ${value}`,
    className:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
}

/** Map a source type to a display label + Tailwind color classes. */
function sourceTypeBadge(type: SourceEntry["type"]): {
  label: string;
  className: string;
} {
  switch (type) {
    case "url":
      return {
        label: "URL",
        className:
          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      };
    case "text":
      return {
        label: "Text",
        className: "bg-surface text-muted",
      };
    case "x-mention":
      return {
        label: "𝕏 Mention",
        className:
          "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      };
    case "wiki-ref":
      return {
        label: "Wiki Reference",
        className:
          "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
      };
    case "image":
      return {
        label: "Image",
        className:
          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      };
    default:
      return {
        label: String(type),
        className: "bg-surface text-muted",
      };
  }
}

/**
 * Display structured provenance entries from the `sources[]` frontmatter
 * field. Falls back to showing the flat `source_url` when no structured
 * sources exist (backward compat for pre-yopedia pages).
 */
function SourceProvenance({
  frontmatter,
}: {
  frontmatter: Frontmatter;
}) {
  // Parse structured sources (stored as JSON string in frontmatter).
  const rawSources = frontmatter.sources as
    | string
    | string[]
    | undefined;
  const sources = parseSources(rawSources);

  // Flat legacy source_url (pre-yopedia pages).
  const sourceUrl =
    typeof frontmatter.source_url === "string" &&
    frontmatter.source_url.trim().length > 0
      ? frontmatter.source_url.trim()
      : null;

  // Nothing to show.
  if (sources.length === 0 && !sourceUrl) return null;

  // Structured sources available — render the rich provenance section.
  if (sources.length > 0) {
    return (
      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
          Provenance
        </h2>
        <div className="space-y-2">
          {sources.map((entry, idx) => {
            const badge = sourceTypeBadge(entry.type);
            const isLink =
              entry.type !== "text" &&
              entry.url !== "text-paste" &&
              /^https?:\/\//.test(entry.url);

            return (
              <div
                key={`${entry.url}-${idx}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                {/* Type badge */}
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>

                {/* URL or label */}
                {isLink ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline truncate max-w-md"
                    title={entry.url}
                  >
                    {entry.url}
                  </a>
                ) : (
                  <span className="text-foreground/60">
                    {entry.url === "text-paste" ? "Text paste" : entry.url}
                  </span>
                )}

                {/* Fetch date */}
                {entry.fetched && (
                  <span className="text-foreground/40 text-xs">
                    fetched {formatDate(entry.fetched)}
                  </span>
                )}

                {/* Triggered by */}
                {entry.triggered_by && entry.triggered_by !== "system" && (
                  <span className="text-foreground/40 text-xs">
                    via {entry.triggered_by}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // Fallback: legacy flat source_url.
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6">
      <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wide mb-3">
        Source
      </h2>
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          URL
        </span>
        {/^https?:\/\//.test(sourceUrl!) ? (
          <a
            href={sourceUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400 truncate max-w-md"
            title={sourceUrl!}
          >
            {sourceUrl}
          </a>
        ) : (
          <span className="text-foreground/60">{sourceUrl}</span>
        )}
      </div>
    </section>
  );
}

/**
 * Slim byline shown directly beneath the page title: the lightweight
 * who/when/how-confident line plus authors and topic tags. The heavier
 * reference fields (validity, aliases, supersedes) live in {@link PageInfo}.
 * Returns `null` when nothing applies, so frontmatter-less pages render only
 * the title.
 */
function PageByline({
  frontmatter,
  discussionStats,
}: {
  frontmatter: Frontmatter;
  discussionStats?: DiscussionStats;
}) {
  const updatedRaw = frontmatter.updated;
  const createdRaw = frontmatter.created;
  const dateLabel =
    typeof updatedRaw === "string" && updatedRaw.length > 0
      ? `Updated ${formatDate(updatedRaw)}`
      : typeof createdRaw === "string" && createdRaw.length > 0
        ? `Created ${formatDate(createdRaw)}`
        : null;

  // source_count is persisted as a string (see ingest.ts); parse defensively.
  const sourceCountRaw = frontmatter.source_count;
  const sourceCountNum =
    typeof sourceCountRaw === "string" && sourceCountRaw.length > 0
      ? Number.parseInt(sourceCountRaw, 10)
      : NaN;
  const sourceLabel =
    Number.isFinite(sourceCountNum) && sourceCountNum >= 1
      ? `${sourceCountNum} ${sourceCountNum === 1 ? "source" : "sources"}`
      : null;

  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((t) => typeof t === "string" && t.length > 0)
    : [];

  // Confidence badge: show only when confidence is a finite number.
  const confidenceRaw = frontmatter.confidence;
  const confidenceNum =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? confidenceRaw
      : typeof confidenceRaw === "string" && /^-?\d+(\.\d+)?$/.test(confidenceRaw)
        ? Number(confidenceRaw)
        : null;
  const confidence =
    confidenceNum !== null && Number.isFinite(confidenceNum)
      ? confidenceDisplay(confidenceNum)
      : null;

  const authors = Array.isArray(frontmatter.authors)
    ? frontmatter.authors.filter((a) => typeof a === "string" && a.length > 0)
    : [];
  const contributors = Array.isArray(frontmatter.contributors)
    ? frontmatter.contributors.filter(
        (c) => typeof c === "string" && c.length > 0 && !authors.includes(c),
      )
    : [];

  const disputed = frontmatter.disputed === true;
  const hasOpenDiscussions = (discussionStats?.open ?? 0) > 0;

  const hasMetaLine =
    dateLabel !== null ||
    sourceLabel !== null ||
    confidence !== null ||
    disputed ||
    hasOpenDiscussions;

  if (!hasMetaLine && authors.length === 0 && tags.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {hasMetaLine && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {dateLabel && <span>{dateLabel}</span>}
          {dateLabel && sourceLabel && <span aria-hidden>·</span>}
          {sourceLabel && <span>{sourceLabel}</span>}
          {confidence && (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${confidence.className}`}
            >
              {confidence.label}
            </span>
          )}
          {disputed && (
            <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
              ⚠ Disputed
            </span>
          )}
          {hasOpenDiscussions && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              💬 {discussionStats!.open} open{" "}
              {discussionStats!.open === 1 ? "thread" : "threads"}
            </span>
          )}
        </div>
      )}

      {authors.length > 0 && (
        <AuthorBadges authors={authors} contributors={contributors} />
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-surface px-2 py-0.5 text-xs text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Demoted reference details (temporal validity, dispute note, aliases, the
 * superseded page). Rendered in the desktop sidebar rail and, on mobile,
 * inline below the article. Returns `null` when there's nothing to show.
 */
function PageInfo({
  frontmatter,
  className,
}: {
  frontmatter: Frontmatter;
  className?: string;
}) {
  const expiryRaw = frontmatter.expiry;
  const expiryStr =
    typeof expiryRaw === "string" && expiryRaw.length >= 10 ? expiryRaw : null;
  const expiryDate = expiryStr ? new Date(expiryStr) : null;
  const isExpired =
    expiryDate !== null && !isNaN(expiryDate.getTime()) && expiryDate < new Date();

  const validFromRaw = frontmatter.valid_from;
  const validFromStr =
    typeof validFromRaw === "string" && validFromRaw.length >= 10
      ? validFromRaw
      : null;

  const disputed = frontmatter.disputed === true;

  const aliases = Array.isArray(frontmatter.aliases)
    ? frontmatter.aliases.filter((a) => typeof a === "string" && a.length > 0)
    : [];

  const supersedes =
    typeof frontmatter.supersedes === "string" &&
    frontmatter.supersedes.length > 0
      ? frontmatter.supersedes
      : null;

  const hasValidity =
    validFromStr !== null ||
    (expiryStr !== null && expiryDate !== null && !isNaN(expiryDate.getTime()));

  if (!hasValidity && !disputed && aliases.length === 0 && !supersedes) {
    return null;
  }

  return (
    <section className={className}>
      <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
        Page info
      </h2>
      <div className="space-y-2 text-sm">
        {hasValidity && (
          <div>
            {isExpired ? (
              <span className="text-amber-600 dark:text-amber-400">
                ⚠{validFromStr ? ` Verified ${formatMonthYear(validFromStr)} ·` : ""} Expired {formatDate(expiryStr!)} — may be outdated
              </span>
            ) : validFromStr && expiryStr ? (
              <span className="text-muted">
                Verified {formatMonthYear(validFromStr)} · Review by {formatMonthYear(expiryStr)}
              </span>
            ) : validFromStr ? (
              <span className="text-muted">
                Verified {formatMonthYear(validFromStr)}
              </span>
            ) : (
              <span className="text-muted">
                Review by {formatMonthYear(expiryStr!)}
              </span>
            )}
          </div>
        )}

        {disputed && (
          <div className="text-orange-600 dark:text-orange-400">
            This page has unresolved contradictions
          </div>
        )}

        {aliases.length > 0 && (
          <div className="text-muted">
            Also known as: {aliases.join(", ")}
          </div>
        )}

        {supersedes && (
          <div className="text-muted">
            Replaces:{" "}
            <Link
              href={`/wiki/${supersedes}`}
              className="text-accent hover:underline"
            >
              {supersedes}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
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
  const { slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);

  if (!page) {
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

  const backlinks = await findBacklinks(slug);
  const discussStats = await getDiscussionStats(slug);
  const hasSourceUrl =
    typeof page.frontmatter.source_url === "string" &&
    page.frontmatter.source_url.trim().length > 0;
  // A raw source exists for any ingested page (URL/text/image/x-mention). Used
  // to show the "View source" link; /raw/<slug> 404s gracefully otherwise.
  const hasRawSource =
    hasSourceUrl || Number(page.frontmatter.source_count ?? 0) > 0;

  // "Share with yoyo" is shown only to the page's owner/contributor, and we
  // pre-compute whether it's already shared into their yoyo.
  const principal = await getPrincipal();
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

  const toc = buildToc(page.body);
  const articleBody = stripLeadingH1(page.body);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href="/wiki"
        className="text-sm text-muted hover:text-foreground transition-colors"
      >
        ← Back to index
      </Link>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        {/* Reading column */}
        <div className="min-w-0">
          <article>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {page.title}
            </h1>
            <PageByline
              frontmatter={page.frontmatter}
              discussionStats={discussStats}
            />
            <div className="mt-8">
              <MarkdownRenderer
                content={articleBody}
                className="prose-article"
                headingIds={toc.map((t) => t.id)}
              />
            </div>
          </article>

          <SourceProvenance frontmatter={page.frontmatter} />

          {/* Page info — inline on mobile; the rail shows it on desktop. */}
          <PageInfo
            frontmatter={page.frontmatter}
            className="mt-8 border-t border-border pt-6 lg:hidden"
          />

          {backlinks.length > 0 && (
            <section className="mt-10 border-t border-border pt-6">
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
                What links here
              </h2>
              <ul className="mt-2 space-y-1">
                {backlinks.map((bl) => (
                  <li key={bl.slug}>
                    <Link
                      href={`/wiki/${bl.slug}`}
                      className="text-sm text-accent hover:underline"
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

          <div className="mt-12 border-t border-border pt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/wiki/${slug}/edit`}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
            >
              Edit page
            </Link>
            {hasRawSource && (
              <Link
                href={`/raw/${slug}`}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
              >
                View source
              </Link>
            )}
            {hasSourceUrl && <ReingestButton slug={slug} />}
            {canShare && (
              <ShareWithYoyoButton slug={slug} initiallyShared={alreadyShared} />
            )}
            <DeletePageButton slug={slug} />
          </div>
        </div>

        {/* Right rail — table of contents + page info (desktop only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-8">
            <TableOfContents items={toc} />
            <PageInfo frontmatter={page.frontmatter} />
          </div>
        </aside>
      </div>
    </main>
  );
}
