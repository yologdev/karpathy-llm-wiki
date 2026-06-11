"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecentJobIds } from "@/lib/recent-ingests";
import { commonsPath } from "@/lib/links";

interface JobView {
  jobId: string;
  status: "queued" | "processing" | "done" | "failed";
  slug?: string;
  error?: string;
  url?: string;
  title?: string;
}

const LABEL: Record<JobView["status"], { text: string; color: string }> = {
  queued: { text: "queued", color: "var(--muted)" },
  processing: { text: "working…", color: "var(--accent)" },
  done: { text: "done", color: "var(--accent)" },
  failed: { text: "failed", color: "var(--rust)" },
};

/**
 * The recently-submitted async ingest jobs (from localStorage), each with its
 * live status — so a user can see whether a queued ingest finished or failed,
 * even after navigating away or reloading.
 */
export function RecentIngests() {
  const [jobs, setJobs] = useState<JobView[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshes = 0;

    async function load() {
      const ids = getRecentJobIds();
      if (ids.length === 0) {
        if (!cancelled) setJobs([]);
        return;
      }
      const results = await Promise.all(
        ids.map(async (id): Promise<JobView | null> => {
          try {
            const res = await fetch(`/api/ingest/status/${id}`);
            if (!res.ok) return null; // gone / not owner — drop quietly
            return { jobId: id, ...(await res.json()) };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const live = results.filter((j): j is JobView => j !== null);
      setJobs(live);
      // Keep refreshing while anything is still in flight, with a hard cap
      // (~6min) so a stuck job can't drive an endless background refresh. The
      // server also ages a stalled job to `failed`, so this rarely matters.
      refreshes += 1;
      if (
        refreshes < 90 &&
        live.some((j) => j.status === "queued" || j.status === "processing")
      ) {
        timer = setTimeout(load, 4000);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <section style={{ marginTop: 36, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
      <p className="fmark" style={{ marginBottom: 12 }}>
        Recent ingests
      </p>
      <ul className="stack" style={{ gap: 9, listStyle: "none", margin: 0, padding: 0 }}>
        {jobs.map((j) => {
          const label = LABEL[j.status];
          return (
            <li
              key={j.jobId}
              className="row"
              style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
            >
              <span
                className="receipt"
                style={{ fontSize: 11, color: label.color, minWidth: 60 }}
              >
                {label.text}
              </span>
              {j.status === "done" && j.slug ? (
                <Link href={commonsPath(j.slug)} style={{ color: "var(--accent)", fontSize: 13.5 }}>
                  {j.title || j.slug}
                </Link>
              ) : (
                <span style={{ fontSize: 13.5, color: "var(--ink-2)", wordBreak: "break-all" }}>
                  {j.title || j.url || j.jobId}
                </span>
              )}
              {j.status === "failed" && j.error && (
                <span className="receipt" style={{ fontSize: 11.5, color: "var(--rust)" }}>
                  {j.error}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
