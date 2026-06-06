"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { commonsPath, pagePath, ownerToTenant } from "@/lib/links";
import { Icon } from "@/components/folio/icons";
import { Confidence, Mark } from "@/components/folio/primitives";
import { RemoveFromVaultButton } from "@/components/RemoveFromVaultButton";

type Sort = "recent" | "confidence" | "sources";

interface VaultLite {
  id: string;
  name: string;
  visibility: "public" | "private";
}

interface BrowseClientProps {
  pages: IndexEntry[];
  myHandle: string | null;
  /** The active lens scope: `"all"` (Public) or `"vault:<id>"`. */
  activeScope: string;
  /** The signed-in user's own vaults — one lens pill each. */
  myVaults: VaultLite[];
  discussionStats?: Record<string, { total: number; open: number }>;
}

/** A single editorial result row (Folio `PageRow`). */
function PageRow({
  page,
  discussion,
  removeVaultId,
}: {
  page: IndexEntry;
  discussion?: { total: number; open: number };
  /** When set, render a per-row "Remove" to curate the page out of this vault. */
  removeVaultId?: string;
}) {
  const owner = page.owner && page.owner !== "system" ? page.owner : null;
  const agentOwned = !!owner && owner.includes("--");
  const rel = page.updated ? formatRelativeTime(page.updated) : null;
  const openCount = discussion?.open ?? 0;
  // The "Mine" lens can include the viewer's PRIVATE pages — those have no
  // global URL (and `/wiki/<slug>` 404s them), so only PUBLIC commons pages link
  // to the global `/wiki/<slug>`; private/agent pages stay owner-scoped.
  const isCommons =
    page.visibility !== "private" && !page.type?.startsWith("agent-");
  const href = isCommons
    ? commonsPath(page.slug)
    : pagePath(ownerToTenant(page.owner), page.slug);

  return (
    <li style={{ borderTop: "1px solid var(--rule)" }}>
      <Link
        href={href}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 22,
          alignItems: "baseline",
          padding: removeVaultId ? "22px 0 12px" : "22px 0",
          textDecoration: "none",
        }}
      >
        <div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <h3
              style={{
                margin: 0,
                fontSize: 21,
                fontWeight: 600,
                letterSpacing: "-.02em",
                lineHeight: 1.2,
                color: "var(--ink)",
              }}
            >
              {page.title}
            </h3>
            {openCount > 0 && (
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
                {openCount} open
              </span>
            )}
          </div>
          {page.summary && (
            <p
              style={{
                margin: "8px 0 12px",
                fontSize: 14.5,
                color: "var(--muted)",
                lineHeight: 1.6,
                maxWidth: "62ch",
              }}
            >
              {page.summary}
            </p>
          )}
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            {(page.tags ?? []).slice(0, 3).map((t) => (
              <span
                key={t}
                className="receipt"
                style={{ fontSize: 11.5, color: "var(--ink-2)" }}
              >
                #{t}
              </span>
            ))}
            {owner && <Mark id={owner} agent={agentOwned} />}
            <span
              className="receipt"
              style={{ fontSize: 11.5, color: "var(--faint)" }}
            >
              {(page.sourceCount ?? 0)}{" "}
              {(page.sourceCount ?? 0) === 1 ? "source" : "sources"}
              {rel ? ` · ${rel}` : ""}
            </span>
          </div>
        </div>
        {page.confidence !== undefined && (
          <div
            className="stack"
            style={{ gap: 9, alignItems: "flex-end", paddingTop: 4 }}
          >
            <Confidence value={page.confidence} withLabel />
          </div>
        )}
      </Link>
      {removeVaultId && (
        <div className="row" style={{ paddingBottom: 18 }}>
          <RemoveFromVaultButton slug={page.slug} vaultId={removeVaultId} />
        </div>
      )}
    </li>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: Sort; label: string }[];
  value: Sort;
  onChange: (v: Sort) => void;
}) {
  return (
    <div className="stack" style={{ gap: 9 }}>
      <span className="fmark">{label}</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              style={{
                fontSize: 13,
                padding: "5px 12px",
                borderRadius: 999,
                transition: "all .15s",
                whiteSpace: "nowrap",
                border: `1px solid ${active ? "var(--ink)" : "var(--rule)"}`,
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--paper)" : "var(--ink-2)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BrowseClient({
  pages,
  myHandle,
  activeScope,
  myVaults,
  discussionStats,
}: BrowseClientProps) {
  // The active vault id (if the lens is a vault scope) and whether it's one of
  // the viewer's OWN vaults — only then do rows get a per-row Remove control.
  const activeVaultId = activeScope.startsWith("vault:")
    ? activeScope.slice("vault:".length)
    : null;
  const activeVault = activeVaultId
    ? myVaults.find((v) => v.id === activeVaultId)
    : null;
  const ownVaultLens = activeVault ?? null;

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [tag, setTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const f = new Map<string, number>();
    for (const p of pages) for (const t of p.tags ?? []) f.set(t, (f.get(t) ?? 0) + 1);
    return [...f.entries()].sort((a, b) => b[1] - a[1]);
  }, [pages]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = pages.filter((p) => {
      if (
        needle &&
        !`${p.title} ${p.summary} ${(p.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      if (tag && !(p.tags ?? []).includes(tag)) return false;
      return true;
    });
    r.sort((a, b) =>
      sort === "confidence"
        ? (b.confidence ?? 0) - (a.confidence ?? 0)
        : sort === "sources"
          ? (b.sourceCount ?? 0) - (a.sourceCount ?? 0)
          : (b.updated ?? "").localeCompare(a.updated ?? ""),
    );
    return r;
  }, [pages, q, sort, tag]);

  // Lens links switch the Public/vault scope only (a server navigation that
  // re-fetches the page set). The active topic is local UI state, so it
  // intentionally resets when the scope changes.
  const lensHref = (scope: string) =>
    `/wiki?scope=${encodeURIComponent(scope)}`;

  return (
    <div className="fade">
      <section className="shell" style={{ paddingTop: 64 }}>
        <p className="fmark" style={{ marginBottom: 20 }}>
          {activeVault
            ? `vault · ${activeVault.name}`
            : "the commons · public"}
        </p>
        <div
          className="browse-head"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 28,
            alignItems: "end",
          }}
        >
          <h1
            className="display"
            style={{ fontSize: "clamp(38px,5vw,62px)", margin: 0 }}
          >
            Browse the commons
          </h1>
          <p
            className="receipt"
            style={{
              fontSize: 13,
              color: "var(--muted)",
              margin: 0,
              paddingBottom: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--ink)", fontSize: 15 }}>
              {filtered.length}
            </span>{" "}
            of {pages.length} pages
          </p>
        </div>

        {/* Search */}
        <div
          className="row"
          style={{
            gap: 12,
            marginTop: 30,
            padding: "14px 18px",
            borderRadius: 14,
            border: "1px solid var(--rule-strong)",
            background: "var(--paper-2)",
          }}
        >
          <span style={{ color: "var(--muted)" }}>
            <Icon.search width="19" height="19" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, summaries, topics…"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: "transparent",
              fontSize: 16,
              color: "var(--ink)",
            }}
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="receipt"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--muted)",
                fontSize: 12,
              }}
            >
              clear
            </button>
          )}
        </div>
      </section>

      <section
        className="shell browse-layout"
        style={{
          marginTop: 36,
          display: "grid",
          gridTemplateColumns: "210px 1fr",
          gap: 52,
          alignItems: "start",
        }}
      >
        {/* Filter rail */}
        <aside
          className="browse-rail stack"
          style={{ gap: 26, position: "sticky", top: 88 }}
        >
          {myHandle && (
            <div className="stack" style={{ gap: 9 }}>
              <span className="fmark">lens</span>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {[
                  { scope: "all", label: "Public", active: !activeVaultId },
                  ...myVaults.map((v) => ({
                    scope: `vault:${v.id}`,
                    label: v.name,
                    active: activeVaultId === v.id,
                  })),
                ].map((o) => (
                  <Link
                    key={o.scope}
                    href={lensHref(o.scope)}
                    style={{
                      fontSize: 13,
                      padding: "5px 12px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                      textDecoration: "none",
                      border: `1px solid ${o.active ? "var(--ink)" : "var(--rule)"}`,
                      background: o.active ? "var(--ink)" : "transparent",
                      color: o.active ? "var(--paper)" : "var(--ink-2)",
                    }}
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <FilterRow
            label="sort by"
            value={sort}
            onChange={setSort}
            options={[
              { id: "recent", label: "Recent" },
              { id: "confidence", label: "Confidence" },
              { id: "sources", label: "Sources" },
            ]}
          />

          {allTags.length > 0 && (
            <div className="stack" style={{ gap: 9 }}>
              <span className="fmark">topics</span>
              <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
                {allTags.map(([t, n]) => {
                  const active = tag === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTag(active ? null : t)}
                      className="receipt"
                      style={{
                        fontSize: 11.5,
                        padding: "4px 9px",
                        borderRadius: 6,
                        transition: "all .15s",
                        border: `1px solid ${active ? "var(--accent)" : "var(--rule)"}`,
                        background: active ? "var(--accent-soft)" : "transparent",
                        color: active ? "var(--accent)" : "var(--muted)",
                      }}
                    >
                      #{t} <span style={{ opacity: 0.6 }}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Results */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center" }}>
              <p style={{ fontSize: 22, color: "var(--ink-2)" }}>
                Nothing in the commons matches.
              </p>
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                Loosen a filter, or{" "}
                <Link
                  href="/ingest"
                  style={{
                    color: "var(--accent)",
                    borderBottom: "1px solid var(--accent-soft)",
                    textDecoration: "none",
                  }}
                >
                  ingest a new source
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                borderTop: "1px solid var(--rule)",
              }}
            >
              {filtered.map((p) => (
                <PageRow
                  key={p.slug}
                  page={p}
                  discussion={discussionStats?.[p.slug]}
                  removeVaultId={ownVaultLens ? ownVaultLens.id : undefined}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
