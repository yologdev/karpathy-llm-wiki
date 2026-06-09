import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { commonsPath, pagePath, ownerToTenant } from "@/lib/links";
import { coverGradient, monogram } from "@/lib/cover";
import { isArtifactType } from "@/lib/wiki";

/**
 * A profile's pages as a blog-style index: boxed Folio cards in a responsive
 * grid, each with a generated gradient cover (no rendering cost), an excerpt,
 * and brand meta. Saved HTML answers (`type:"html"`) read as blog posts and get
 * an "HTML" badge. Presentational only — the profile page sorts + supplies data.
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
  const artifact = isArtifactType(page.type);
  // Same href logic as the browse PageRow: public commons → /wiki/<slug>;
  // private/agent → owner-scoped /u/<tenant>/<slug>.
  const href =
    page.visibility !== "private" && !page.type?.startsWith("agent-")
      ? commonsPath(page.slug)
      : pagePath(ownerToTenant(page.owner), page.slug);

  return (
    <Link
      href={href}
      className="stack"
      style={{
        textDecoration: "none",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--paper)",
        transition: "border-color .15s",
      }}
    >
      {/* Cover band — gradient + monogram, with an HTML badge for artifacts. */}
      <div
        aria-hidden
        style={{
          position: "relative",
          height: 96,
          display: "grid",
          placeItems: "center",
          background: coverGradient(page.slug),
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 40,
            fontWeight: 700,
            color: "rgba(255,255,255,.92)",
            letterSpacing: ".04em",
          }}
        >
          {monogram(page.title)}
        </span>
        {artifact && (
          <span
            className="receipt"
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              fontSize: 9.5,
              letterSpacing: ".12em",
              color: "#fff",
              background: "rgba(0,0,0,.28)",
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            HTML
          </span>
        )}
      </div>

      {/* Body — title, excerpt, meta. */}
      <div className="stack" style={{ gap: 8, padding: "16px 18px 18px" }}>
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
          style={{ gap: 12, flexWrap: "wrap", marginTop: 2 }}
        >
          {(page.tags ?? []).slice(0, 2).map((t) => (
            <span
              key={t}
              className="receipt"
              style={{ fontSize: 11, color: "var(--ink-2)" }}
            >
              #{t}
            </span>
          ))}
          <span
            className="receipt"
            style={{ fontSize: 11, color: "var(--faint)" }}
          >
            {rel ?? ""}
            {(page.sourceCount ?? 0) > 0
              ? `${rel ? " · " : ""}${page.sourceCount} ${page.sourceCount === 1 ? "source" : "sources"}`
              : ""}
          </span>
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
