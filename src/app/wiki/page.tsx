import Link from "next/link";
import { listWikiPages } from "@/lib/wiki";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { WikiIndexClient } from "@/components/WikiIndexClient";

export default async function WikiIndex() {
  const pages = await listWikiPages();

  // Fetch discussion stats for all pages in one batch.
  const slugs = pages.map((p) => p.slug);
  const statsMap = await getDiscussionStatsForSlugs(slugs);

  // Convert Map → plain object so it can be serialized across the server/client boundary.
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) {
    discussionStats[slug] = stats;
  }

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

      <WikiIndexClient pages={pages} discussionStats={discussionStats} />
    </main>
  );
}
