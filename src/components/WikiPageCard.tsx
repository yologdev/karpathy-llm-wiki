import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { commonsPath, pagePath, ownerToTenant } from "@/lib/links";
import { isArtifactType } from "@/lib/page-types";

interface WikiPageCardProps {
  page: IndexEntry;
  discussionCount?: { total: number; open: number };
}

export function WikiPageCard({ page, discussionCount }: WikiPageCardProps) {
  const relLabel = page.updated ? formatRelativeTime(page.updated) : null;
  const pageTags = page.tags ?? [];
  const hasOpenDiscussions = (discussionCount?.open ?? 0) > 0;
  // Show real owners; hide the legacy/system placeholder.
  const owner = page.owner && page.owner !== "system" ? page.owner : null;
  // PUBLIC commons pages link to the global `/wiki/<slug>`; pages with no global
  // URL — private, agent-scoped, OR html artifacts (excluded from the commons) —
  // stay owner-scoped at `/u/<tenant>/<slug>` (which `/wiki/<slug>` would 404).
  const href =
    page.visibility !== "private" &&
    !page.type?.startsWith("agent-") &&
    !isArtifactType(page.type)
      ? commonsPath(page.slug)
      : pagePath(ownerToTenant(page.owner), page.slug);
  const hasMeta =
    pageTags.length > 0 ||
    relLabel !== null ||
    (page.sourceCount ?? 0) > 0 ||
    hasOpenDiscussions ||
    owner !== null;

  return (
    <li>
      <Link
        href={href}
        className="group block rounded-lg border border-border p-4 hover:border-accent/40 transition-colors"
      >
        <span className="font-medium group-hover:text-accent transition-colors">
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
                className="inline-block rounded-full bg-surface px-2 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
            {owner && (
              <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/60">
                by @{owner}
              </span>
            )}
            {relLabel && <span>updated {relLabel}</span>}
            {(page.sourceCount ?? 0) > 0 && (
              <span>
                {page.sourceCount}{" "}
                {page.sourceCount === 1 ? "source" : "sources"}
              </span>
            )}
            {hasOpenDiscussions && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                💬 {discussionCount!.open} open
              </span>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}
