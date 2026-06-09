"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { IndexEntry } from "@/lib/types";
import type { BrowsePayload, DiscussionStats, TagFacet } from "@/lib/browse";
import { formatRelativeTime } from "@/lib/format";
import { commonsPath, pagePath, ownerToTenant } from "@/lib/links";
import { isArtifactType } from "@/lib/page-types";
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
  myHandle: string | null;
  /** The active lens scope: `"all"` (Public) or `"vault:<id>"`. */
  activeScope: string;
  /** The signed-in user's own vaults — one lens pill each. */
  myVaults: VaultLite[];
  /** First page (server-rendered, no query) — the client re-fetches from here. */
  initialResults: IndexEntry[];
  /** Total matches for the initial (unsearched) scope — drives pagination. */
  initialTotal: number;
  /** Tag facets across the whole scope pool, by count desc (stable rail). */
  initialTags: TagFacet[];
  initialDiscussionStats: DiscussionStats;
  pageSize: number;
  /** Initial tag filter (from `?tag=` — e.g. a tag chip on an article). */
  initialTag?: string | null;
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
  // The vault lens can include the viewer's PRIVATE pages — those have no global
  // URL (and `/wiki/<slug>` 404s them), so only PUBLIC commons pages link to the
  // global `/wiki/<slug>`; private/agent pages stay owner-scoped.
  const isCommons =
    page.visibility !== "private" &&
    !page.type?.startsWith("agent-") &&
    !isArtifactType(page.type);
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
  disabled,
}: {
  label: string;
  options: { id: Sort; label: string }[];
  value: Sort;
  onChange: (v: Sort) => void;
  disabled?: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 9, opacity: disabled ? 0.45 : 1 }}>
      <span className="fmark">{label}</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              disabled={disabled}
              onClick={() => onChange(o.id)}
              style={{
                fontSize: 13,
                padding: "5px 12px",
                borderRadius: 999,
                transition: "all .15s",
                whiteSpace: "nowrap",
                cursor: disabled ? "not-allowed" : "pointer",
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
  myHandle,
  activeScope,
  myVaults,
  initialResults,
  initialTotal,
  initialTags,
  initialDiscussionStats,
  pageSize,
  initialTag,
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
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [tag, setTag] = useState<string | null>(initialTag ?? null);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState(initialResults);
  const [total, setTotal] = useState(initialTotal);
  const [discussionStats, setDiscussionStats] = useState(initialDiscussionStats);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  // Bumped to force the fetch effect to re-run on a manual "Retry" without
  // otherwise changing the query/sort/tag/page inputs.
  const [retryTick, setRetryTick] = useState(0);

  const searching = debouncedQ.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Debounce the search box so we fetch on a settled query, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Server-driven results: re-fetch whenever the query/sort/tag/page changes.
  // Skip the very first run — the server already rendered page 1 (with any
  // `?tag=`) into `initialResults`, so re-fetching it on mount would only flash.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    params.set("scope", activeScope);
    if (tag) params.set("tag", tag);
    params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    fetch(`/api/wiki/browse?${params.toString()}`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<BrowsePayload>)
          : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((data) => {
        if (!active) return;
        setResults(data.results ?? []);
        setTotal(data.total ?? 0);
        setDiscussionStats(data.discussionStats ?? {});
        setFetchError(false);
      })
      .catch(() => {
        // Keep the last results rather than blanking, but surface the failure so
        // a persistent outage doesn't masquerade as "no change".
        if (active) setFetchError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQ, sort, tag, page, activeScope, pageSize, retryTick]);

  // A filter change always returns to page 1 — reset imperatively (alongside the
  // change) so a fetch never fires with a stale page number.
  const onSearchChange = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onSortChange = (v: Sort) => {
    setSort(v);
    setPage(1);
  };
  const onTagChange = (v: string | null) => {
    setTag(v);
    setPage(1);
  };

  // Lens links switch the Public/vault scope only (a server navigation that
  // re-renders with a fresh page set). The active topic is local UI state, so it
  // intentionally resets when the scope changes.
  const lensHref = (scope: string) =>
    `/wiki?scope=${encodeURIComponent(scope)}`;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

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
            <span style={{ color: "var(--ink)", fontSize: 15 }}>{total}</span>{" "}
            {searching ? (total === 1 ? "result" : "results") : "pages"}
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
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search the commons — by meaning or keyword…"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: "transparent",
              fontSize: 16,
              color: "var(--ink)",
            }}
          />
          {loading && (
            <span
              className="receipt"
              style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap" }}
            >
              searching…
            </span>
          )}
          {q && (
            <button
              onClick={() => onSearchChange("")}
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

          <div className="stack" style={{ gap: 6 }}>
            <FilterRow
              label="sort by"
              value={sort}
              onChange={onSortChange}
              disabled={searching}
              options={[
                { id: "recent", label: "Recent" },
                { id: "confidence", label: "Confidence" },
                { id: "sources", label: "Sources" },
              ]}
            />
            {searching && (
              <span
                className="receipt"
                style={{ fontSize: 11, color: "var(--faint)" }}
              >
                ranked by relevance
              </span>
            )}
          </div>

          {initialTags.length > 0 && (
            <div className="stack" style={{ gap: 9 }}>
              <span className="fmark">topics</span>
              <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
                {initialTags.map(([t, n]) => {
                  const active = tag === t;
                  return (
                    <button
                      key={t}
                      onClick={() => onTagChange(active ? null : t)}
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
          {fetchError && (
            <div
              className="row"
              style={{
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--rust)",
                background: "var(--rust-soft)",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--rust)" }}>
                Couldn&apos;t refresh results — showing the last set.
              </span>
              <button
                type="button"
                onClick={() => setRetryTick((t) => t + 1)}
                disabled={loading}
                className="receipt"
                style={{
                  fontSize: 12.5,
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--rust)",
                  background: "transparent",
                  color: "var(--rust)",
                  cursor: loading ? "default" : "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}
          {tag && (
            <div
              className="row"
              style={{ gap: 8, alignItems: "center", marginBottom: 14 }}
            >
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Filtered by
              </span>
              <span
                className="receipt"
                style={{ fontSize: 12.5, color: "var(--accent)" }}
              >
                #{tag}
              </span>
              <button
                type="button"
                onClick={() => onTagChange(null)}
                className="receipt"
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                · clear ✕
              </button>
            </div>
          )}
          {results.length === 0 ? (
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
            <>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  borderTop: "1px solid var(--rule)",
                  opacity: loading ? 0.55 : 1,
                  transition: "opacity .15s",
                }}
              >
                {results.map((p) => (
                  <PageRow
                    key={p.slug}
                    page={p}
                    discussion={discussionStats?.[p.slug]}
                    removeVaultId={ownVaultLens ? ownVaultLens.id : undefined}
                  />
                ))}
              </ul>

              {totalPages > 1 && (
                <div
                  className="row"
                  style={{
                    gap: 16,
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 26,
                    marginTop: 8,
                    borderTop: "1px solid var(--rule)",
                  }}
                >
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="receipt"
                    style={{
                      fontSize: 13,
                      padding: "6px 14px",
                      borderRadius: 999,
                      border: "1px solid var(--rule)",
                      background: "transparent",
                      color: page <= 1 ? "var(--faint)" : "var(--ink-2)",
                      cursor: page <= 1 ? "default" : "pointer",
                    }}
                  >
                    ← Prev
                  </button>
                  <span
                    className="receipt"
                    style={{ fontSize: 12.5, color: "var(--muted)" }}
                  >
                    {from}–{to} of {total} · page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="receipt"
                    style={{
                      fontSize: 13,
                      padding: "6px 14px",
                      borderRadius: 999,
                      border: "1px solid var(--rule)",
                      background: "transparent",
                      color: page >= totalPages ? "var(--faint)" : "var(--ink-2)",
                      cursor: page >= totalPages ? "default" : "pointer",
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
