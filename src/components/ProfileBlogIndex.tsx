import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { commonsPath, pagePath, ownerToTenant } from "@/lib/links";
import { isArtifactType } from "@/lib/page-types";

/**
 * A profile's saved HTML artifacts as cards: boxed Folio cards in a responsive
 * grid with an excerpt and brand meta. Artifacts (`type:"html"`) read as blog
 * posts and carry an "HTML" tag. Presentational only — the profile page selects
 * + supplies the artifact pages.
 */

function ProfileCard({
  page,
  discussion,
}: {
  page: IndexEntry;
  discussion?: { total: number; open: number };
}) {
  const rel = page.updated ? formatRelativeTime(page.updated) : null;
  const open = discussion?.open ?? 0;
  // Artifacts (and private/agent pages) have no global URL → owner-scoped
  // /u/<tenant>/<slug>; only public commons pages link to /wiki/<slug>.
  const href =
    page.visibility !== "private" &&
    !page.type?.startsWith("agent-") &&
    !isArtifactType(page.type)
      ? commonsPath(page.slug)
      : pagePath(ownerToTenant(page.owner), page.slug);

  return (
    <Link
      href={href}
      className="stack"
      style={{
        gap: 9,
        textDecoration: "none",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        background: "var(--paper)",
        padding: "16px 18px 18px",
        transition: "border-color .15s",
      }}
    >
      {isArtifactType(page.type) && (
        <span
          className="receipt"
          style={{
            alignSelf: "flex-start",
            fontSize: 9.5,
            letterSpacing: ".12em",
            color: "var(--accent)",
            background: "var(--accent-soft)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            padding: "2px 7px",
          }}
        >
          HTML
        </span>
      )}
      <h3
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
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {page.summary}
        </p>
      )}
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 2 }}>
        {(page.tags ?? []).slice(0, 2).map((t) => (
          <span
            key={t}
            className="receipt"
            style={{ fontSize: 11, color: "var(--ink-2)" }}
          >
            #{t}
          </span>
        ))}
        {rel && (
          <span
            className="receipt"
            style={{ fontSize: 11, color: "var(--faint)" }}
          >
            {rel}
          </span>
        )}
        {open > 0 && (
          <span
            className="receipt"
            style={{
              fontSize: 9.5,
              color: "var(--rust)",
              background: "var(--rust-soft)",
              borderRadius: 3,
              padding: "1px 6px",
            }}
          >
            {open} open
          </span>
        )}
      </div>
    </Link>
  );
}

export function ProfileBlogIndex({
  pages,
  discussionStats,
}: {
  pages: IndexEntry[];
  discussionStats: Record<string, { total: number; open: number }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))",
        gap: 18,
      }}
    >
      {pages.map((page) => (
        <ProfileCard
          key={page.slug}
          page={page}
          discussion={discussionStats[page.slug]}
        />
      ))}
    </div>
  );
}
