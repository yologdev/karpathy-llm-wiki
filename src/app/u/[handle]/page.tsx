import Link from "next/link";
import { listReadableWikiPages } from "@/lib/wiki";
import { slugsForOwner } from "@/lib/search";
import { listAgentsForOwner, agentShortName } from "@/lib/agents";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { listVaults } from "@/lib/vault";
import { decodeSlug } from "@/lib/slugify";
import { buildContributorProfile } from "@/lib/contributors";
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

// Shared Folio pill style for the owner-scoped action links.
const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  padding: "7px 13px",
  borderRadius: 999,
  border: "1px solid var(--rule)",
  color: "var(--ink-2)",
  textDecoration: "none",
  whiteSpace: "nowrap" as const,
};

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
  const mine = new Set(await slugsForOwner(handle));
  const readable = await listReadableWikiPages(principal);
  // Newest-first, so the profile reads like a blog index.
  const pages = readable
    .filter((p) => mine.has(p.slug))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  const agents = await listAgentsForOwner(handle);

  // Contribution stats (edits/comments/trust) — moved here from the retired
  // /wiki/contributors/<handle> page. Shown only when the handle has activity.
  const contrib = await buildContributorProfile(handle, undefined, principal);
  const hasActivity =
    contrib.editCount > 0 ||
    contrib.commentCount > 0 ||
    contrib.threadsCreated > 0;

  // Public vaults this handle owns — their curated reference lenses over the
  // commons. Private vaults are hidden on the public profile.
  const vaults = (await listVaults(handle)).filter(
    (v) => v.visibility === "public",
  );

  const statsMap = await getDiscussionStatsForSlugs(pages.map((p) => p.slug));
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

        {/* Silo actions — query/graph/export scoped to this handle's pages. */}
        {pages.length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            <Link href={`/query?scope=owner:${encodeURIComponent(handle)}`} style={pill}>
              💬 Ask these pages
            </Link>
            <Link href={`/wiki/graph?scope=owner:${encodeURIComponent(handle)}`} style={pill}>
              🕸 Graph this silo
            </Link>
            {/* Plain anchor — this is a file download, not a route. */}
            <a href={`/api/wiki/export?scope=owner:${encodeURIComponent(handle)}`} style={pill}>
              ⬇ Download vault
            </a>
          </div>
        )}

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
          <div className="stack" style={{ gap: 8 }}>
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/u/${handle}/a/${agentShortName(agent)}`}
                className="stack"
                style={{
                  gap: 3,
                  textDecoration: "none",
                  border: "1px solid var(--rule)",
                  borderRadius: 12,
                  background: "var(--paper-2)",
                  padding: "13px 16px",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {agent.name}
                </span>
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
                  {agent.description}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {pages.length === 0 && vaults.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No pages yet.</p>
      ) : (
        pages.length > 0 && (
          <section>
            <p className="fmark" style={{ marginBottom: 14 }}>
              {pages.length} {pages.length === 1 ? "page" : "pages"}
            </p>
            <ProfileBlogIndex pages={pages} discussionStats={discussionStats} />
          </section>
        )
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
