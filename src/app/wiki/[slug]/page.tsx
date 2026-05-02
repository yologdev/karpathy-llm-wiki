import Link from "next/link";
import { readWikiPageWithFrontmatter, findBacklinks, type Frontmatter } from "@/lib/wiki";
import { parseSources } from "@/lib/sources";
import type { SourceEntry } from "@/lib/types";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { DeletePageButton } from "@/components/DeletePageButton";
import { ReingestButton } from "@/components/ReingestButton";
import { RevisionHistory } from "@/components/RevisionHistory";
import { DiscussionPanel } from "@/components/DiscussionPanel";

interface WikiPageProps {
  params: Promise<{ slug: string }>;
}

/** Truncate a date-ish string to its `YYYY-MM-DD` prefix (no library). */
function formatDate(value: string): string {
  return value.slice(0, 10);
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
        className:
          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      };
    case "x-mention":
      return {
        label: "𝕏 Mention",
        className:
          "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      };
    default:
      return {
        label: String(type),
        className:
          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
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
      <section className="mt-8 border-t border-foreground/10 pt-6">
        <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wide mb-3">
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
                    className="text-blue-600 hover:underline dark:text-blue-400 truncate max-w-md"
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
 * Render a small muted metadata strip (date + source count + tag pills +
 * yopedia fields) built from a page's parsed frontmatter. Returns `null`
 * when no metadata fields are present, so legacy frontmatter-less pages
 * render nothing.
 */
function PageMetadata({ frontmatter }: { frontmatter: Frontmatter }) {
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

  // --- Yopedia fields ---

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

  // Expiry / staleness: show only when expiry is a non-empty string.
  const expiryRaw = frontmatter.expiry;
  const expiryStr =
    typeof expiryRaw === "string" && expiryRaw.length >= 10
      ? expiryRaw
      : null;
  const expiryDate = expiryStr ? new Date(expiryStr) : null;
  const isExpired =
    expiryDate !== null && !isNaN(expiryDate.getTime()) && expiryDate < new Date();

  // Authors
  const authors = Array.isArray(frontmatter.authors)
    ? frontmatter.authors.filter(
        (a) => typeof a === "string" && a.length > 0,
      )
    : [];

  // Contributors (only show extras not already in authors)
  const contributors = Array.isArray(frontmatter.contributors)
    ? frontmatter.contributors.filter(
        (c) =>
          typeof c === "string" && c.length > 0 && !authors.includes(c),
      )
    : [];

  // Disputed badge
  const disputed = frontmatter.disputed === true;

  // Aliases
  const aliases = Array.isArray(frontmatter.aliases)
    ? frontmatter.aliases.filter(
        (a) => typeof a === "string" && a.length > 0,
      )
    : [];

  // Supersedes
  const supersedes =
    typeof frontmatter.supersedes === "string" &&
    frontmatter.supersedes.length > 0
      ? frontmatter.supersedes
      : null;

  const hasDateLine = dateLabel !== null || sourceLabel !== null;
  const hasTags = tags.length > 0;
  const hasYopedia =
    confidence !== null ||
    expiryStr !== null ||
    authors.length > 0 ||
    disputed ||
    aliases.length > 0 ||
    supersedes !== null;

  if (!hasDateLine && !hasTags && !hasYopedia) return null;

  return (
    <div className="mb-6 space-y-2">
      {/* Row 1: date · sources · confidence · disputed */}
      {(hasDateLine || confidence || disputed) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {dateLabel && <span>{dateLabel}</span>}
          {dateLabel && sourceLabel && <span>·</span>}
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
        </div>
      )}

      {/* Row 2: tags */}
      {hasTags && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Row 3: authors + contributors */}
      {authors.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          By {authors.join(", ")}
          {contributors.length > 0 && (
            <span className="ml-1 text-gray-400 dark:text-gray-500">
              + {contributors.length}{" "}
              {contributors.length === 1 ? "contributor" : "contributors"}
            </span>
          )}
        </div>
      )}

      {/* Row 4: expiry / staleness */}
      {expiryStr && expiryDate && !isNaN(expiryDate.getTime()) && (
        <div className="text-sm">
          {isExpired ? (
            <span className="text-amber-600 dark:text-amber-400">
              ⚠ Expired {formatDate(expiryStr)} — may be outdated
            </span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">
              Expires {formatDate(expiryStr)}
            </span>
          )}
        </div>
      )}

      {/* Row 5: disputed explanation */}
      {disputed && (
        <div className="text-sm text-orange-600 dark:text-orange-400">
          This page has unresolved contradictions
        </div>
      )}

      {/* Row 6: aliases */}
      {aliases.length > 0 && (
        <div className="text-sm text-gray-400 dark:text-gray-500">
          Also known as: {aliases.join(", ")}
        </div>
      )}

      {/* Row 7: supersedes link */}
      {supersedes && (
        <div className="text-sm text-gray-400 dark:text-gray-500">
          Replaces:{" "}
          <Link
            href={`/wiki/${supersedes}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {supersedes}
          </Link>
        </div>
      )}
    </div>
  );
}

export default async function WikiPageView({ params }: WikiPageProps) {
  const { slug } = await params;
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
  const hasSourceUrl =
    typeof page.frontmatter.source_url === "string" &&
    page.frontmatter.source_url.trim().length > 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/wiki"
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to index
      </Link>
      <article className="mt-6">
        <PageMetadata frontmatter={page.frontmatter} />
        <MarkdownRenderer content={page.content} />
      </article>
      <SourceProvenance frontmatter={page.frontmatter} />
      {backlinks.length > 0 && (
        <section className="mt-10 border-t border-foreground/10 pt-6">
          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wide">
            What links here
          </h2>
          <ul className="mt-2 space-y-1">
            {backlinks.map((bl) => (
              <li key={bl.slug}>
                <Link
                  href={`/wiki/${bl.slug}`}
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
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
      <div className="mt-12 border-t border-foreground/10 pt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/wiki/${slug}/edit`}
          className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
        >
          Edit page
        </Link>
        {hasSourceUrl && <ReingestButton slug={slug} />}
        <DeletePageButton slug={slug} />
      </div>
    </main>
  );
}
