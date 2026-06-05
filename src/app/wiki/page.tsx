import Link from "next/link";
import { listReadableWikiPages } from "@/lib/wiki";
import { listCommonsPages } from "@/lib/commons";
import type { IndexEntry } from "@/lib/types";
import { slugsForOwner } from "@/lib/search";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { WikiIndexClient } from "@/components/WikiIndexClient";
import { TagChip } from "@/components/TagChip";

export default async function WikiIndex({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; tag?: string }>;
}) {
  const { scope: scopeParam, tag: tagParam } = await searchParams;
  const tag = tagParam?.trim() || null;
  const principal = await getPrincipal();
  const myHandle = principal?.handle ?? null;

  // Effective scope: explicit ?scope wins; otherwise signed-in users default to
  // their own content ("Mine"), guests to the full public commons ("All").
  // This is a soft VIEW filter over public content — not access control.
  const effectiveScope = scopeParam ?? (myHandle ? "mine" : "all");
  const ownerHandle =
    effectiveScope === "mine"
      ? myHandle
      : effectiveScope.startsWith("owner:")
        ? effectiveScope.slice("owner:".length)
        : null;
  const showingMine = ownerHandle !== null;

  let pages: IndexEntry[];
  if (ownerHandle) {
    // "Mine"/owner scope: the user's own pages (public + their private),
    // filtered to what the viewer may read.
    const mine = new Set(await slugsForOwner(ownerHandle));
    pages = (await listReadableWikiPages(principal)).filter((p) =>
      mine.has(p.slug),
    );
  } else {
    // "All" scope = the public commons (read from the commons index).
    pages = await listCommonsPages();
  }

  // Top topics across the current scope (computed BEFORE the tag filter so the
  // chips always show every available topic). Drives the "browse by topic" row.
  const tagFreq = new Map<string, number>();
  for (const p of pages) {
    for (const t of p.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  }
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([t, count]) => ({ tag: t, count }));

  // Optional topic filter (from a "browse by topic" chip).
  if (tag) {
    pages = pages.filter((p) => (p.tags ?? []).includes(tag));
  }

  const slugs = pages.map((p) => p.slug);
  const statsMap = await getDiscussionStatsForSlugs(slugs);
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) {
    discussionStats[slug] = stats;
  }

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
      active
        ? "bg-foreground/10 font-semibold text-foreground"
        : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
    }`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Wiki</h1>
        <div className="flex gap-2">
          <Link
            href="/wiki/contributors"
            className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            👥 Contributors
          </Link>
          <Link
            href="/wiki/log"
            className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            📋 Activity Log
          </Link>
        </div>
      </div>

      {/* Mine | All lens — "Mine" shown only when signed in. A soft view filter
          over public content (everyone can still view All). */}
      <div className="mb-4 inline-flex items-center gap-1 rounded-lg border border-foreground/10 p-1">
        {myHandle && (
          <Link href="/wiki?scope=mine" className={tabClass(showingMine)}>
            Mine
          </Link>
        )}
        <Link href="/wiki?scope=all" className={tabClass(!showingMine)}>
          All
        </Link>
      </div>

      {/* Browse by topic — filter the current scope by tag. */}
      {topTags.length >= 3 && !tag && (
        <div className="mb-6">
          <h2 className="label mb-2">browse by topic</h2>
          <div className="flex flex-wrap gap-2">
            {topTags.map(({ tag: t, count }) => (
              <TagChip
                key={t}
                tag={t}
                count={count}
                href={`/wiki?scope=${encodeURIComponent(effectiveScope)}&tag=${encodeURIComponent(t)}`}
              />
            ))}
          </div>
        </div>
      )}

      {tag && (
        <div className="mb-4 flex items-center gap-2 text-sm text-foreground/60">
          <span>
            Filtered by{" "}
            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              #{tag}
            </span>
          </span>
          <Link
            href={showingMine ? "/wiki?scope=mine" : "/wiki?scope=all"}
            className="underline hover:text-foreground"
          >
            clear
          </Link>
        </div>
      )}

      {pages.length === 0 && tag ? (
        <p className="text-foreground/60">
          No pages tagged <span className="font-medium">#{tag}</span>.{" "}
          <Link href="/wiki?scope=all" className="underline hover:text-foreground">
            Browse all content
          </Link>
          .
        </p>
      ) : pages.length === 0 && showingMine ? (
        <p className="text-foreground/60">
          You haven&rsquo;t added any pages yet.{" "}
          <Link href="/wiki?scope=all" className="underline hover:text-foreground">
            Browse all content
          </Link>{" "}
          or{" "}
          <Link href="/ingest" className="underline hover:text-foreground">
            ingest a source
          </Link>
          .
        </p>
      ) : (
        <WikiIndexClient pages={pages} discussionStats={discussionStats} />
      )}
    </main>
  );
}
