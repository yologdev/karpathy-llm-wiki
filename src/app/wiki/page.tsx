import { listReadableWikiPages } from "@/lib/wiki";
import { listCommonsPages } from "@/lib/commons";
import type { IndexEntry } from "@/lib/types";
import { slugsForOwner } from "@/lib/search";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { BrowseClient } from "@/components/BrowseClient";

export default async function WikiIndex({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; tag?: string }>;
}) {
  const { scope: scopeParam } = await searchParams;
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

  const slugs = pages.map((p) => p.slug);
  const statsMap = await getDiscussionStatsForSlugs(slugs);
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  return (
    <BrowseClient
      pages={pages}
      myHandle={myHandle}
      showingMine={showingMine}
      discussionStats={discussionStats}
    />
  );
}
