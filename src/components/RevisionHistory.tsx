"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/format";

interface Revision {
  timestamp: number;
  date: string;
  slug: string;
  sizeBytes: number;
}

interface RevisionHistoryProps {
  slug: string;
}

/**
 * Collapsible revision history panel rendered at the bottom of a wiki page.
 *
 * Fetches revisions on-demand when the user expands the section — keeps the
 * server component thin and avoids unnecessary API calls for pages the user
 * is just reading.
 */
export function RevisionHistory({ slug }: RevisionHistoryProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Viewing a specific revision
  const [viewingTimestamp, setViewingTimestamp] = useState<number | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Revert state
  const [reverting, setReverting] = useState(false);

  const fetchRevisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${slug}/revisions`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to load revisions (${res.status})`);
      }
      const data = (await res.json()) as { revisions: Revision[] };
      setRevisions(data.revisions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && revisions === null && !loading) {
      fetchRevisions();
    }
  }

  async function handleView(timestamp: number) {
    if (viewingTimestamp === timestamp) {
      // Toggle off
      setViewingTimestamp(null);
      setViewContent(null);
      return;
    }

    setViewLoading(true);
    setViewingTimestamp(timestamp);
    setViewContent(null);
    try {
      const res = await fetch(`/api/wiki/${slug}/revisions?timestamp=${timestamp}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to load revision (${res.status})`);
      }
      const data = (await res.json()) as { content: string };
      setViewContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setViewingTimestamp(null);
    } finally {
      setViewLoading(false);
    }
  }

  async function handleRevert(timestamp: number) {
    const dateStr = new Date(timestamp).toLocaleString();
    if (!window.confirm(`Revert this page to the version from ${dateStr}? The current content will be saved as a revision first.`)) {
      return;
    }

    setReverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${slug}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert", timestamp }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Revert failed (${res.status})`);
      }
      // Refresh the page to show the reverted content.
      router.refresh();
      // Re-fetch revisions to show the new state.
      setViewingTimestamp(null);
      setViewContent(null);
      await fetchRevisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReverting(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }

  return (
    <section className="mt-10 border-t border-foreground/10 pt-6">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls="revision-history-panel"
        className="flex items-center gap-2 text-sm font-medium text-foreground/50 uppercase tracking-wide hover:text-foreground/70 transition-colors"
      >
        {/* Clock icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        History
        <span className="text-xs font-normal">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div id="revision-history-panel" className="mt-4">
          {loading && (
            <p className="text-sm text-foreground/50">Loading revisions…</p>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Error: {error}
            </p>
          )}

          {!loading && revisions !== null && revisions.length === 0 && (
            <p className="text-sm text-foreground/50">
              No previous revisions for this page.
            </p>
          )}

          {!loading && revisions !== null && revisions.length > 0 && (
            <ul className="space-y-3">
              {revisions.map((rev) => (
                <li key={rev.timestamp}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-foreground/70">
                      {formatRelativeTime(rev.date)}
                    </span>
                    <span className="text-xs text-foreground/40">
                      {formatBytes(rev.sizeBytes)}
                    </span>
                    <span className="text-xs text-foreground/30">
                      {new Date(rev.timestamp).toLocaleString()}
                    </span>
                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleView(rev.timestamp)}
                        disabled={viewLoading && viewingTimestamp === rev.timestamp}
                        aria-label={`View revision from ${new Date(rev.timestamp).toLocaleString()}`}
                        className="rounded border border-foreground/20 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50 transition-colors"
                      >
                        {viewingTimestamp === rev.timestamp && viewContent !== null
                          ? "Hide"
                          : viewLoading && viewingTimestamp === rev.timestamp
                            ? "Loading…"
                            : "View"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevert(rev.timestamp)}
                        disabled={reverting}
                        aria-label={`Restore revision from ${new Date(rev.timestamp).toLocaleString()}`}
                        className="rounded border border-amber-500/30 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/20 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30 transition-colors"
                      >
                        {reverting ? "Reverting…" : "Revert"}
                      </button>
                    </div>
                  </div>

                  {/* Inline content viewer */}
                  {viewingTimestamp === rev.timestamp && viewContent !== null && (
                    <div className="mt-2 max-h-96 overflow-auto rounded border border-foreground/10 bg-foreground/[0.02] p-4">
                      <pre className="whitespace-pre-wrap text-xs text-foreground/80 font-mono">
                        {viewContent}
                      </pre>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
