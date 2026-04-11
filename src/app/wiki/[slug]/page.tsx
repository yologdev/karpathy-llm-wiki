import Link from "next/link";
import { readWikiPageWithFrontmatter, findBacklinks, type Frontmatter } from "@/lib/wiki";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { DeletePageButton } from "@/components/DeletePageButton";

interface WikiPageProps {
  params: Promise<{ slug: string }>;
}

/** Truncate a date-ish string to its `YYYY-MM-DD` prefix (no library). */
function formatDate(value: string): string {
  return value.slice(0, 10);
}

/**
 * Render a small muted metadata strip (date + source count + tag pills)
 * built from a page's parsed frontmatter. Returns `null` when no metadata
 * fields are present, so legacy frontmatter-less pages render nothing.
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

  const hasDateLine = dateLabel !== null || sourceLabel !== null;
  const hasTags = tags.length > 0;
  if (!hasDateLine && !hasTags) return null;

  return (
    <div className="mb-6">
      {hasDateLine && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {dateLabel}
          {dateLabel && sourceLabel ? " · " : ""}
          {sourceLabel}
        </div>
      )}
      {hasTags && (
        <div className="mt-2 flex flex-wrap gap-1.5">
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
      <div className="mt-12 border-t border-foreground/10 pt-6 flex items-center gap-3">
        <Link
          href={`/wiki/${slug}/edit`}
          className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
        >
          Edit page
        </Link>
        <DeletePageButton slug={slug} />
      </div>
    </main>
  );
}
