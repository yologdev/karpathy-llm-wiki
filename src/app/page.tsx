import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { WikiPageCard } from "@/components/WikiPageCard";
import { ContributorBadge } from "@/components/ContributorBadge";
import { TagChip } from "@/components/TagChip";
import { HomeAsk } from "@/components/HomeAsk";
import { HomeGraph } from "@/components/HomeGraph";
import { Trail } from "@/components/Trail";
import { listWikiPages, isAgentScopedType } from "@/lib/wiki";
import { listContributors } from "@/lib/contributors";
import { getTrail } from "@/lib/trail";

export default async function Home() {
  const [allPages, contributors, trail] = await Promise.all([
    listWikiPages(),
    listContributors(),
    getTrail(10),
  ]);

  // Public commons only — agent-scoped pages stay out of the stats/feeds.
  const pages = allPages.filter((p) => !isAgentScopedType(p.type));

  const pageCount = pages.length;
  const sourceCount = pages.reduce((n, p) => n + (p.sourceCount ?? 0), 0);
  const contributorCount = contributors.length;

  const recent = [...pages]
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, 6);

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
      {/* Hero — value prop + the live Ask box (the star) */}
      <section className="max-w-3xl">
        <p className="label">a wiki for the agent age</p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
          A second brain for humans and agents.
        </h1>
        <p className="mt-4 text-lg text-muted leading-relaxed">
          Not RAG — it{" "}
          <span className="font-medium text-foreground">accumulates</span>:
          sources become cited pages, contradictions reconcile, and lineage
          stays visible.
        </p>
      </section>

      <div className="mt-6 max-w-3xl">
        <HomeAsk />
      </div>

      {/* Receipts — proof of life, in mono */}
      {pageCount > 0 && (
        <div className="receipt mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <span>
            <span className="font-semibold text-foreground">{pageCount}</span>{" "}
            {pageCount === 1 ? "page" : "pages"}
          </span>
          <span aria-hidden className="text-border">·</span>
          <span>
            <span className="font-semibold text-foreground">{sourceCount}</span>{" "}
            {sourceCount === 1 ? "source" : "sources"}
          </span>
          <span aria-hidden className="text-border">·</span>
          <span>
            <span className="font-semibold text-foreground">{contributorCount}</span>{" "}
            {contributorCount === 1 ? "contributor" : "contributors"}
          </span>
          <span className="ml-auto">
            <StatusBadge />
          </span>
        </div>
      )}

      {pageCount === 0 ? (
        <div className="mt-12">
          <OnboardingWizard pageCount={0} />
        </div>
      ) : (
        <>
          {/* The lab running: live trail + the substrate */}
          <section className="mt-16 grid gap-10 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <h2 className="label">the trail</h2>
              <p className="mt-1 text-sm text-muted">
                Every ingest and edit, humans and agents alike.
              </p>
              <div className="mt-4">
                {trail.length > 0 ? (
                  <Trail events={trail} />
                ) : (
                  <p className="text-sm text-muted">
                    Nothing yet — ingest a source to start the trail.
                  </p>
                )}
              </div>
            </div>
            <div className="lg:col-span-2">
              <h2 className="label">the substrate</h2>
              <p className="mt-1 text-sm text-muted">Pages, interlinked.</p>
              <div className="mt-4">
                <HomeGraph />
              </div>
            </div>
          </section>

          {/* Recently accumulated */}
          <section className="mt-16">
            <div className="flex items-baseline justify-between">
              <h2 className="label">recently accumulated</h2>
              <Link
                href="/wiki"
                className="receipt text-xs text-muted hover:text-foreground transition-colors"
              >
                browse all →
              </Link>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {recent.map((p) => (
                <WikiPageCard key={p.slug} page={p} />
              ))}
            </ul>
          </section>

          {/* Browse by topic */}
          {topTags.length >= 3 && (
            <section className="mt-12">
              <h2 className="label">browse by topic</h2>
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

          {/* Contributors (humans; agents shown distinctly in the trail) */}
          {contributorCount >= 2 && (
            <section className="mt-12">
              <div className="flex items-baseline justify-between">
                <h2 className="label">contributors</h2>
                <Link
                  href="/wiki/contributors"
                  className="receipt text-xs text-muted hover:text-foreground transition-colors"
                >
                  see all →
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

          {/* How it works — slim */}
          <section className="mt-16 border-t border-rule pt-6 text-sm text-muted leading-relaxed">
            <span className="label align-middle">how it works</span>{" "}
            <span className="ml-1">
              Ingest a source → it updates pages, preserves lineage, and
              reconciles contradictions → ask, and get cited answers.
            </span>
          </section>
        </>
      )}
    </div>
  );
}
