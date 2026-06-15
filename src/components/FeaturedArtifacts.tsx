import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { sharePath, ownerToTenant } from "@/lib/links";
import { isAgentHandle } from "@/lib/agent-handle";
import { Avatar, Mark } from "@/components/folio/primitives";

/**
 * Homepage gallery of recent PUBLIC, human-made artifacts — the rendered,
 * shareable pages (`type:"html"`/`"slides"`) people build from the commons.
 * Boxed Folio cards in a responsive grid: the same card language as the profile
 * artifacts (`ProfileBlogIndex`), but with owner attribution (the homepage mixes
 * authors) and a correct HTML/SLIDES badge.
 *
 * Presentational only — it renders whatever pages it's given. The homepage's
 * `selectFeaturedArtifacts` does the public-only + human-made selection, so a
 * private artifact never reaches this anonymous, cacheable surface.
 */
function ArtifactCard({ page }: { page: IndexEntry }) {
  const rel = page.updated ? formatRelativeTime(page.updated) : null;
  // Hide the legacy/system placeholder owner; show real humans + agents.
  const owner = page.owner && page.owner !== "system" ? page.owner : null;
  const agent = owner ? isAgentHandle(owner) : false;
  const kind = page.type === "slides" ? "Slides" : "HTML";

  return (
    <Link
      // Open the artifact in the chrome-less full-screen share view (its content
      // fills the viewport), not the wiki-chromed owner page.
      href={sharePath(ownerToTenant(page.owner), page.slug)}
      className="stack group rounded-[14px] border border-[color:var(--rule)] hover:border-accent/40 transition-colors"
      style={{
        gap: 9,
        textDecoration: "none",
        background: "var(--paper)",
        padding: "16px 18px 18px",
      }}
    >
      <span
        className="receipt"
        style={{
          alignSelf: "flex-start",
          fontSize: 9.5,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--accent)",
          background: "var(--accent-soft)",
          border: "1px solid var(--rule)",
          borderRadius: 4,
          padding: "2px 7px",
        }}
      >
        {kind}
      </span>
      <h3
        className="group-hover:text-accent transition-colors"
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-.01em",
          lineHeight: 1.25,
          color: "var(--ink)",
        }}
      >
        {page.title}
      </h3>
      {page.summary && (
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--muted)",
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {page.summary}
        </p>
      )}
      <div
        className="row"
        style={{ gap: 8, alignItems: "center", marginTop: 2 }}
      >
        {owner && (
          <span
            className="row"
            style={{ gap: 7, alignItems: "center", minWidth: 0 }}
          >
            <Avatar id={owner} agent={agent} size={20} />
            <Mark id={owner} agent={agent} />
          </span>
        )}
        {rel && (
          <span
            className="receipt"
            style={{
              fontSize: 11,
              color: "var(--faint)",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {rel}
          </span>
        )}
      </div>
    </Link>
  );
}

export function FeaturedArtifacts({ pages }: { pages: IndexEntry[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
        gap: 18,
      }}
    >
      {pages.map((page) => (
        <ArtifactCard key={page.slug} page={page} />
      ))}
    </div>
  );
}
