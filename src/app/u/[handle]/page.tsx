import Link from "next/link";
import { listReadableWikiPages, isArtifactType, tenantForOwner } from "@/lib/wiki";
import { slugsForOwner } from "@/lib/search";
import { listAgentsForOwner } from "@/lib/agents";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { listVaults } from "@/lib/vault";
import { decodeSlug } from "@/lib/slugify";
import { buildContributorProfile } from "@/lib/contributors";
import { belongsInCommons } from "@/lib/commons";
import { getOwnerTrail } from "@/lib/trail";
import { Trail } from "@/components/Trail";
import { ProfileBlogIndex } from "@/components/ProfileBlogIndex";

/** Trust score → a short label (mirrors the retired contributor detail page). */
function trustLabel(score: number): string {
  if (score >= 0.7) return "Established";
  if (score >= 0.3) return "Growing";
  return "New";
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="stack"
      style={{
        gap: 2,
        border: "1px solid var(--rule)",
        borderRadius: 10,
        background: "var(--paper-2)",
        padding: "10px 13px",
      }}
    >
      <span
        className="receipt"
        style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
    </div>
  );
}

// Public profile: pages a given handle owns or has contributed to. Visible to
// anyone (guests included) — yopedia is a public observer surface.
export default async function UserPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: encoded } = await params;
  const handle = decodeSlug(encoded);

  const principal = await getPrincipal();
  // These reads are independent (each only needs `handle`/`principal`), so fetch
  // them concurrently rather than serially — the page is render-blocked on the
  // SLOWEST, not their sum. (Measured: the serial waterfall was a needless ~1s.)
  const [mineList, readable, agents, contrib, vaultsAll] = await Promise.all([
    slugsForOwner(handle),
    listReadableWikiPages(principal),
    listAgentsForOwner(handle),
    // Contribution stats (edits/comments/trust) — moved here from the retired
    // /wiki/contributors/<handle> page. Shown only when the handle has activity.
    buildContributorProfile(handle, undefined, principal),
    listVaults(handle),
  ]);

  const mine = new Set(mineList);
  // Newest-first, so the profile reads like a blog index.
  const pages = readable
    .filter((p) => mine.has(p.slug))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  // Two public surfaces: commons pages render as a user-scoped activity trail
  // (ingests + edits on those pages); saved HTML artifacts render as cards.
  const commonsPages = pages.filter((p) => belongsInCommons(p));
  const artifacts = pages.filter((p) => isArtifactType(p.type));
  const hasActivity =
    contrib.editCount > 0 ||
    contrib.commentCount > 0 ||
    contrib.threadsCreated > 0;
  // Public vaults this handle owns — their curated reference lenses over the
  // commons. Private vaults are hidden on the public profile.
  const vaults = vaultsAll.filter((v) => v.visibility === "public");

  // The remaining two reads depend on the derived page lists above, so they form
  // a second concurrent tier. The trail is served from the per-owner activity
  // index (O(1) once seeded) keyed by the SAME tenant the write path pushes to
  // (slugsForOwner matched these pages by `tenantForOwner(handle)`), with the
  // scan as the cold-start seed + fallback.
  const [trail, statsMap] = await Promise.all([
    getOwnerTrail(tenantForOwner(handle), commonsPages, 60),
    getDiscussionStatsForSlugs(artifacts.map((p) => p.slug)),
  ]);
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  return (
    <main
      style={{
        maxWidth: 940,
        margin: "0 auto",
        padding: "56px 24px 88px",
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <Link
          href="/wiki?scope=all"
          className="receipt"
          style={{ fontSize: 12, color: "var(--faint)", textDecoration: "none" }}
        >
          ← All content
        </Link>
        <h1
          className="display"
          style={{ margin: "12px 0 4px", fontSize: 40 }}
        >
          @{handle}
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Public pages owned or contributed by {handle}.
        </p>

        {/* Contribution stats — only when the handle has activity. */}
        {hasActivity && (
          <div style={{ marginTop: 18 }}>
            <span
              className="receipt"
              style={{
                display: "inline-block",
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 999,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                border: "1px solid var(--rule)",
              }}
            >
              {trustLabel(contrib.trustScore)} · trust{" "}
              {contrib.trustScore.toFixed(2)}
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(120px, 100%), 1fr))",
                gap: 10,
                marginTop: 12,
              }}
            >
              <StatCell label="Edits" value={contrib.editCount} />
              <StatCell label="Pages edited" value={contrib.pagesEdited} />
              <StatCell label="Comments" value={contrib.commentCount} />
              <StatCell label="Threads" value={contrib.threadsCreated} />
              {contrib.revertCount > 0 && (
                <StatCell label="Reverts" value={contrib.revertCount} />
              )}
              <StatCell label="First seen" value={contrib.firstSeen.slice(0, 10)} />
              <StatCell label="Last seen" value={contrib.lastSeen.slice(0, 10)} />
            </div>
          </div>
        )}
      </header>

      {agents.length > 0 && (
        <section style={{ marginBottom: 34 }}>
          <p className="fmark" style={{ marginBottom: 12 }}>
            Agents
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {agents.map((agent) => (
              <span
                key={agent.id}
                style={{
                  fontWeight: 600,
                  color: "var(--ink)",
                  border: "1px solid var(--rule)",
                  borderRadius: 999,
                  background: "var(--paper-2)",
                  padding: "5px 13px",
                }}
              >
                {agent.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Key the empty state off the RENDERED surfaces — a profile whose only
          content is non-public (private/agent pages, not shown here) should still
          read "No pages yet" rather than a blank gap. */}
      {trail.length === 0 && artifacts.length === 0 && vaults.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No public pages yet.</p>
      )}

      {/* Saved HTML artifacts → cards. Shown above the activity trail: an
          artifact is the person's actual work, so it leads. */}
      {artifacts.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <p className="fmark" style={{ marginBottom: 14 }}>
            {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"}
          </p>
          <ProfileBlogIndex pages={artifacts} discussionStats={discussionStats} />
        </section>
      )}

      {/* Commons pages → a user-scoped activity trail (ingests + edits). */}
      {trail.length > 0 && (
        <section>
          <p className="fmark" style={{ marginBottom: 14 }}>
            Activity
          </p>
          <Trail events={trail} />
        </section>
      )}

      {vaults.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <p className="fmark" style={{ marginBottom: 8 }}>
            Vaults
          </p>
          <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted)" }}>
            Curated reference lenses over the commons — live references, not copies.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {vaults.map((vault) => (
              <Link
                key={vault.id}
                href={`/wiki?scope=vault:${vault.id}`}
                className="spread"
                style={{
                  alignItems: "center",
                  textDecoration: "none",
                  border: "1px solid var(--rule)",
                  borderRadius: 12,
                  padding: "13px 16px",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {vault.name}
                </span>
                <span className="receipt" style={{ fontSize: 12, color: "var(--muted)" }}>
                  {vault.slugs.length} {vault.slugs.length === 1 ? "page" : "pages"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
