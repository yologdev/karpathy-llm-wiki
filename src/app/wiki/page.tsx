import Link from "next/link";
import { listWikiPages } from "@/lib/wiki";
import { slugsForOwner } from "@/lib/search";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { WikiIndexClient } from "@/components/WikiIndexClient";

export default async function WikiIndex({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
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

  let pages = await listWikiPages();
  if (ownerHandle) {
    const mine = new Set(await slugsForOwner(ownerHandle));
    pages = pages.filter((p) => mine.has(p.slug));
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

      {pages.length === 0 && showingMine ? (
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
