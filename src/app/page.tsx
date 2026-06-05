import Link from "next/link";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { ContributorBadge } from "@/components/ContributorBadge";
import { HomeAsk } from "@/components/HomeAsk";
import { Trail } from "@/components/Trail";
import { listCommonsPages } from "@/lib/commons";
import { listContributors } from "@/lib/contributors";
import { getTrail } from "@/lib/trail";
import { getPrincipal } from "@/lib/auth";

export default async function Home() {
  const principal = await getPrincipal();
  const [commonsPages, contributors, trail] = await Promise.all([
    // The homepage is the public commons — read it from the commons index
    // (falls back to deriving the public set when the index is empty).
    listCommonsPages(),
    listContributors(principal),
    getTrail(10, principal),
  ]);

  // listCommonsPages already excludes private + agent-scoped pages.
  const pages = commonsPages;

  const pageCount = pages.length;
  const sourceCount = pages.reduce((n, p) => n + (p.sourceCount ?? 0), 0);
  const contributorCount = contributors.length;

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
        </div>
      )}

      {pageCount === 0 ? (
        <div className="mt-12">
          <OnboardingWizard pageCount={0} />
        </div>
      ) : (
        <>
          {/* The lab running: the live trail */}
          <section className="mt-16">
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
          </section>

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
