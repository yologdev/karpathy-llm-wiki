import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { WikiPageCard } from "@/components/WikiPageCard";
import { ContributorBadge } from "@/components/ContributorBadge";
import { GlobalSearch } from "@/components/GlobalSearch";
import { StatCard } from "@/components/StatCard";
import { TagChip } from "@/components/TagChip";
import { listWikiPages, isAgentScopedType } from "@/lib/wiki";
import { listContributors } from "@/lib/contributors";

export default async function Home() {
  const [allPages, contributors] = await Promise.all([
    listWikiPages(),
    listContributors(),
  ]);

  // Match the public /wiki "all" view: hide all agent-scoped pages (identity +
  // knowledge) so the stats, recent grid, and topics reflect the human-facing
  // commons rather than an agent's private workspace.
  const pages = allPages.filter((p) => !isAgentScopedType(p.type));

  const pageCount = pages.length;
  const sourceCount = pages.reduce((n, p) => n + (p.sourceCount ?? 0), 0);
  const contributorCount = contributors.length;

  // Recently updated (the content centerpiece).
  const recent = [...pages]
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, 6);

  // Top topics by tag frequency.
  const tagFreq = new Map<string, number>();
  for (const p of pages) {
    for (const t of p.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  }
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const topContributors = contributors.slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {/* Hero */}
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-foreground/50">
          A wiki for the agent age.
        </p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight">
          yopedia
        </h1>
        <p className="mt-4 text-lg text-foreground/70 leading-relaxed">
          A shared second brain for humans and agents. Not RAG — it{" "}
          <span className="font-medium text-foreground">accumulates</span>: new
          sources update pages, contradictions reconcile, and lineage stays on
          the page.
        </p>
        <div className="mt-4">
          <StatusBadge />
        </div>

        {/* Primary actions + search */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/wiki"
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Browse the wiki
          </Link>
          <Link
            href="/query"
            className="rounded-lg border border-foreground/20 px-5 py-2.5 text-sm font-medium hover:bg-foreground/5 transition-colors"
          >
            Ask a question
          </Link>
          <Link
            href="/ingest"
            className="rounded-lg border border-foreground/20 px-5 py-2.5 text-sm font-medium hover:bg-foreground/5 transition-colors"
          >
            Ingest a source
          </Link>
          <div className="ml-auto hidden sm:block">
            <GlobalSearch />
          </div>
        </div>

        {/* Live stats — proof of life */}
        {pageCount > 0 && (
          <div className="mt-8 flex flex-wrap items-end gap-8 border-t border-foreground/10 pt-6">
            <StatCard value={pageCount} label={pageCount === 1 ? "page" : "pages"} />
            <StatCard value={sourceCount} label={sourceCount === 1 ? "source" : "sources"} />
            <StatCard
              value={contributorCount}
              label={contributorCount === 1 ? "contributor" : "contributors"}
            />
            <span className="text-xs text-foreground/40">growing in public</span>
          </div>
        )}
      </section>

      {pageCount === 0 ? (
        <div className="mt-10">
          <OnboardingWizard pageCount={0} />
        </div>
      ) : (
        <>
          {/* Recently updated — the centerpiece */}
          <section className="mt-14">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Recently updated</h2>
              <Link
                href="/wiki"
                className="text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                Browse all →
              </Link>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {recent.map((p) => (
                <WikiPageCard key={p.slug} page={p} />
              ))}
            </ul>
          </section>

          {/* Browse by topic — hidden when sparse */}
          {topTags.length >= 3 && (
            <section className="mt-12">
              <h2 className="text-xl font-semibold">Browse by topic</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {topTags.map(({ tag, count }) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    count={count}
                    href={`/wiki?scope=all&tag=${encodeURIComponent(tag)}`}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Contributors — social proof, hidden when sparse */}
          {contributorCount >= 2 && (
            <section className="mt-12">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-semibold">Contributors</h2>
                <Link
                  href="/wiki/contributors"
                  className="text-sm text-foreground/60 hover:text-foreground transition-colors"
                >
                  See all →
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {topContributors.map((c) => (
                  <ContributorBadge
                    key={c.handle}
                    handle={c.handle}
                    editCount={c.editCount}
                    trustScore={c.trustScore}
                  />
                ))}
              </div>
            </section>
          )}

          {/* How it works — slim, replaces the old feature tiles */}
          <section className="mt-14 border-t border-foreground/10 pt-6 text-sm text-foreground/60 leading-relaxed">
            <span className="font-medium text-foreground/80">How it works:</span>{" "}
            Ingest a source → it updates pages, preserves lineage, and reconciles
            contradictions → Ask and get cited answers.
          </section>
        </>
      )}
    </div>
  );
}
