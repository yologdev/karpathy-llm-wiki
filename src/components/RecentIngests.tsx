"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecentJobIds } from "@/lib/recent-ingests";
import { commonsPath } from "@/lib/links";
import { hostOf } from "@/lib/share-target";

/** A still-running (or failed) job submitted from THIS browser (live status). */
interface InFlight {
  jobId: string;
  status: "queued" | "processing" | "failed";
  url?: string;
  title?: string;
  error?: string;
}

/** A completed ingest from the server ledger (durable, all sources). */
interface LedgerEntry {
  ingest_id: string;
  source_url: string;
  primary_slug: string;
  finished_at: string;
  status: string;
  deduped?: boolean;
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Recent ingest activity. The durable list comes from the SERVER ledger
 * (`/api/ingest/history`, scoped to pages the caller can read) so it survives
 * across domains/devices and includes EVERY ingest path — the form, the queue,
 * MCP, and the "Save to yopedia" bookmarklet/share (which don't touch this
 * browser's localStorage). On top of that, jobs this browser just submitted are
 * polled by id for live status (incl. failures) until they land in the ledger.
 * Refreshes on tab focus so a bookmarklet save made in a popup appears on return.
 */
export function RecentIngests() {
  const [inflight, setInflight] = useState<InFlight[]>([]);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;

    async function tick() {
      // 1. Durable server history (the source of truth).
      try {
        const res = await fetch("/api/ingest/history?limit=20");
        if (res.ok) {
          const data = (await res.json()) as { entries?: LedgerEntry[] };
          if (!cancelled) {
            setHistory(Array.isArray(data.entries) ? data.entries : []);
            setErrored(false);
          }
        } else if (res.status !== 401) {
          // 401 = signed out (expected → stay quiet). Anything else is a real
          // fault: don't let a 500ing ledger look like "no recent ingests".
          console.warn("[recent-ingests] history fetch failed:", res.status);
          if (!cancelled) setErrored(true);
        }
      } catch (err) {
        // Keep the last-known history, but record the fault so a persistent
        // outage isn't invisible (esp. an empty first load).
        console.warn("[recent-ingests] history fetch error:", err);
        if (!cancelled) setErrored(true);
      }

      // 2. This browser's in-flight (and just-failed) jobs (live status until
      //    success lands in the ledger above).
      const ids = getRecentJobIds();
      const results = ids.length
        ? await Promise.all(
            ids.map(async (id) => {
              try {
                const r = await fetch(`/api/ingest/status/${id}`);
                if (!r.ok) return null;
                return { jobId: id, ...(await r.json()) } as InFlight & {
                  status: string;
                };
              } catch {
                return null;
              }
            }),
          )
        : [];
      if (cancelled) return;
      // Keep queued/processing (live) AND failed (so a failure isn't silent);
      // drop "done" — those surface via the ledger, avoiding a duplicate row.
      const live = results.filter(
        (j): j is InFlight =>
          j !== null &&
          (j.status === "queued" || j.status === "processing" || j.status === "failed"),
      );
      setInflight(live);

      // Keep refreshing while a job is still running (so its completion shows in
      // the ledger), bounded so a stuck job can't drive an endless background loop.
      polls += 1;
      const stillRunning = live.some(
        (j) => j.status === "queued" || j.status === "processing",
      );
      if (polls < 90 && stillRunning) timer = setTimeout(tick, 4000);
    }

    tick();
    // A bookmarklet/share save happens in another tab/popup — refresh on return.
    const onFocus = () => {
      polls = 0;
      tick();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (inflight.length === 0 && history.length === 0) {
    if (!errored) return null;
    // A load error with nothing to show — say so rather than looking empty.
    return (
      <section style={{ marginTop: 36, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
        <p className="fmark" style={{ marginBottom: 12 }}>
          Recent ingests
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Couldn’t load recent activity — try again in a moment.
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 36, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
      <p className="fmark" style={{ marginBottom: 12 }}>
        Recent ingests
      </p>
      <ul className="stack" style={{ gap: 9, listStyle: "none", margin: 0, padding: 0 }}>
        {inflight.map((j) => {
          const failed = j.status === "failed";
          return (
            <li
              key={j.jobId}
              className="row"
              style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
            >
              <span
                className="receipt"
                style={{ fontSize: 11, color: failed ? "var(--rust)" : "var(--accent)", minWidth: 64 }}
              >
                {failed ? "failed" : j.status === "processing" ? "working…" : "queued"}
              </span>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)", wordBreak: "break-all" }}>
                {j.title || j.url || j.jobId}
              </span>
              {failed && j.error && (
                <span className="receipt" style={{ fontSize: 11.5, color: "var(--rust)" }}>
                  {j.error}
                </span>
              )}
            </li>
          );
        })}
        {history.map((e) => (
          <li
            key={e.ingest_id}
            className="row"
            style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
          >
            <span className="receipt" style={{ fontSize: 11, color: "var(--muted)", minWidth: 64 }}>
              {ago(e.finished_at)}
            </span>
            {e.primary_slug ? (
              <Link href={commonsPath(e.primary_slug)} style={{ color: "var(--accent)", fontSize: 13.5 }}>
                {e.primary_slug}
              </Link>
            ) : (
              <span style={{ fontSize: 13.5, color: "var(--ink-2)", wordBreak: "break-all" }}>
                {e.source_url}
              </span>
            )}
            {e.source_url && e.source_url !== "text-paste" && e.source_url !== "upload" && (
              <span className="receipt" style={{ fontSize: 11, color: "var(--faint)" }}>
                {hostOf(e.source_url)}
              </span>
            )}
            {e.deduped && (
              <span className="receipt" style={{ fontSize: 11, color: "var(--faint)" }}>
                merged
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
