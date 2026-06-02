import Link from "next/link";
import { listWikiPages } from "@/lib/wiki";
import { slugsForOwner } from "@/lib/search";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { decodeSlug } from "@/lib/slugify";
import { WikiIndexClient } from "@/components/WikiIndexClient";

// Public profile: pages a given handle owns or has contributed to. Visible to
// anyone (guests included) — yopedia is a public observer surface.
export default async function UserPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: encoded } = await params;
  const handle = decodeSlug(encoded);

  const mine = new Set(await slugsForOwner(handle));
  const pages = (await listWikiPages()).filter((p) => mine.has(p.slug));

  const statsMap = await getDiscussionStatsForSlugs(pages.map((p) => p.slug));
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <Link href="/wiki?scope=all" className="text-sm text-foreground/50 hover:text-foreground">
          ← All content
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">@{handle}</h1>
        <p className="mt-1 text-foreground/60">
          Public pages owned or contributed by {handle}.
        </p>
      </div>

      {pages.length === 0 ? (
        <p className="text-foreground/60">No pages yet.</p>
      ) : (
        <WikiIndexClient pages={pages} discussionStats={discussionStats} />
      )}
    </main>
  );
}
