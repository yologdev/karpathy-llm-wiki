import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

interface WikiPageCardProps {
  page: IndexEntry;
}

export function WikiPageCard({ page }: WikiPageCardProps) {
  const relLabel = page.updated ? formatRelativeTime(page.updated) : null;
  const pageTags = page.tags ?? [];
  const hasMeta =
    pageTags.length > 0 ||
    relLabel !== null ||
    (page.sourceCount ?? 0) > 0;

  return (
    <li>
      <Link
        href={`/wiki/${page.slug}`}
        className="group block rounded-lg border border-foreground/10 p-4 hover:border-foreground/30 transition-colors"
      >
        <span className="font-medium group-hover:underline">
          {page.title}
        </span>
        <span className="mt-1 block text-sm text-foreground/60">
          {page.summary}
        </span>
        {hasMeta && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-foreground/50">
            {pageTags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {tag}
              </span>
            ))}
            {relLabel && <span>updated {relLabel}</span>}
            {(page.sourceCount ?? 0) > 0 && (
              <span>
                {page.sourceCount}{" "}
                {page.sourceCount === 1 ? "source" : "sources"}
              </span>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}
