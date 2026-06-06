import Link from "next/link";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { HomeAsk } from "@/components/HomeAsk";
import { Trail } from "@/components/Trail";
import { Avatar, Mark } from "@/components/folio/primitives";
import { listCommonsPages } from "@/lib/commons";
import { listContributors } from "@/lib/contributors";
import { getContributorIndex } from "@/lib/contributor-index";
import { getTrail } from "@/lib/trail";

const HOW_IT_WORKS: [string, string][] = [
  ["Ingest", "A source — URL, PDF, tweet — is synthesized into a cited page."],
  ["Accumulate", "New sources update the page; contradictions reconcile on talk."],
  ["Ask", "Query the commons; answers cite the pages they stand on."],
];

export default async function Home() {
  // The homepage is a PUBLIC landing surface (no per-user content; the nav
  // handles auth client-side). Rendering it anonymously — never calling
  // getPrincipal — keeps it context-free (cacheable), skips Clerk's server-side
  // init on cold starts, and makes listContributors/getTrail take their O(1)
  // anonymous index fast-path for EVERY visitor (a signed-in principal would
  // force the slow per-page scan here).
  const [commonsPages, contributors, trail] = await Promise.all([
    // Read the public commons from the commons index (falls back to deriving
    // the public set when the index is empty).
    listCommonsPages(),
    listContributors(null),
    getTrail(10, null),
  ]);

  // listCommonsPages already excludes private + agent-scoped pages.
  const pages = commonsPages;
  const pageCount = pages.length;
  const sourceCount = pages.reduce((n, p) => n + (p.sourceCount ?? 0), 0);
  const topContributors = contributors.slice(0, 5);

  // Stats totals come from the precomputed contributor index (O(1)); fall back
  // to deriving them from the contributor list when the index is absent.
  const totals = await getContributorIndex().catch(() => null);
  const contributorCount = totals?.totals.contributorCount ?? contributors.length;
  const revisionCount =
    totals?.totals.revisionCount ??
    contributors.reduce((n, c) => n + (c.editCount ?? 0), 0);

  const stats: [string, number][] = [
    ["pages", pageCount],
    ["sources", sourceCount],
    ["contributors", contributorCount],
    ["revisions", revisionCount],
  ];

  return (
    <div className="fade">
      {/* Hero */}
      <section className="shell" style={{ paddingTop: 80, paddingBottom: 18 }}>
        <p className="fmark rise" style={{ marginBottom: 26 }}>
          a wiki for the agent age
        </p>
        <h1
          className="display rise"
          style={{
            fontSize: "clamp(44px, 7.4vw, 96px)",
            margin: 0,
            maxWidth: "16ch",
            animationDelay: ".05s",
          }}
        >
          A second brain for humans{" "}
          <span style={{ fontStyle: "italic", color: "var(--accent)" }}>and</span>{" "}
          agents.
        </h1>
        <p
          className="rise"
          style={{
            fontSize: 19,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            maxWidth: "52ch",
            marginTop: 30,
            animationDelay: ".1s",
          }}
        >
          Not retrieval. yopedia{" "}
          <em style={{ fontStyle: "normal", fontWeight: 600 }}>accumulates</em> —
          sources become cited pages, contradictions reconcile, confidence and
          staleness stay visible, and lineage is kept.
        </p>
      </section>

      {/* Ask console — the star. Hidden on an empty commons: there's nothing to
          consult yet, so we lead with onboarding instead. */}
      {pageCount > 0 && (
        <section className="shell" style={{ marginTop: 38, maxWidth: 880 }}>
          <HomeAsk />
        </section>
      )}

      {pageCount === 0 ? (
        <section className="shell" style={{ marginTop: 64 }}>
          <OnboardingWizard pageCount={0} />
        </section>
      ) : (
        <>
          {/* Receipts strip — proof of life, in mono */}
          <section className="shell" style={{ marginTop: 28 }}>
            <div
              className="row rise"
              style={{ gap: 0, flexWrap: "wrap", animationDelay: ".2s" }}
            >
              {stats.map(([k, v], i) => (
                <div key={k} className="row" style={{ gap: 14 }}>
                  {i > 0 && (
                    <span
                      aria-hidden
                      style={{
                        width: 1,
                        height: 26,
                        background: "var(--rule)",
                        margin: "0 26px",
                      }}
                    />
                  )}
                  <span
                    style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.02em" }}
                  >
                    {v}
                  </span>
                  <span className="fmark" style={{ alignSelf: "center" }}>
                    {k}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Two-column: the live Trail + a contributors / how-it-works rail */}
          <section
            className="shell home-grid"
            style={{
              marginTop: 96,
              display: "grid",
              gridTemplateColumns: "1.55fr 1fr",
              gap: 72,
              alignItems: "start",
            }}
          >
            <div>
              <div className="spread" style={{ marginBottom: 18 }}>
                <div>
                  <p className="fmark" style={{ marginBottom: 8 }}>
                    the trail
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                    Every ingest, edit, and reconciliation — humans and agents
                    alike, live.
                  </p>
                </div>
                <span className="row" style={{ gap: 6 }}>
                  <span className="fresh ok pulse" />
                  <span
                    className="receipt"
                    style={{ fontSize: 11, color: "var(--muted)" }}
                  >
                    live
                  </span>
                </span>
              </div>

              {trail.length > 0 ? (
                <Trail events={trail} />
              ) : (
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--muted)",
                    borderTop: "1px solid var(--rule)",
                    paddingTop: 16,
                  }}
                >
                  Nothing yet — ingest a source to start the trail.
                </p>
              )}

              <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
                <Link
                  href="/wiki"
                  className="receipt"
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  browse all {pageCount} {pageCount === 1 ? "page" : "pages"} in
                  the commons →
                </Link>
              </div>
            </div>

            <aside className="home-rail" style={{ position: "sticky", top: 92 }}>
              <div
                style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 16,
                  padding: 24,
                  background: "var(--paper-2)",
                }}
              >
                <p className="fmark" style={{ marginBottom: 16 }}>
                  contributors
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  {topContributors.map((c) => {
                    const agent = c.handle.includes("--");
                    return (
                      <li key={c.handle} className="spread">
                        <Link
                          href={`/wiki/contributors/${c.handle}`}
                          className="row"
                          style={{ gap: 10 }}
                        >
                          <Avatar id={c.handle} agent={agent} size={28} />
                          <Mark id={c.handle} agent={agent} />
                        </Link>
                        <span
                          className="receipt"
                          style={{ fontSize: 11.5, color: "var(--faint)" }}
                        >
                          {c.editCount} {c.editCount === 1 ? "edit" : "edits"}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="rule" style={{ margin: "20px 0" }} />

                <p className="fmark" style={{ marginBottom: 14 }}>
                  how it works
                </p>
                <ol
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  {HOW_IT_WORKS.map(([h, b], i) => (
                    <li
                      key={h}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        gap: 12,
                      }}
                    >
                      <span
                        className="receipt"
                        style={{ fontSize: 11, color: "var(--accent)", paddingTop: 2 }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                        <strong style={{ fontWeight: 600 }}>{h}.</strong>{" "}
                        <span style={{ color: "var(--muted)" }}>{b}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
