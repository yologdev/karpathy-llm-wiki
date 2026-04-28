"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RevisionItem } from "./RevisionItem";
import type { Revision } from "./RevisionItem";

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
                <RevisionItem
                  key={rev.timestamp}
                  revision={rev}
                  isViewing={viewingTimestamp === rev.timestamp}
                  viewContent={viewingTimestamp === rev.timestamp ? viewContent : null}
                  viewLoading={viewLoading && viewingTimestamp === rev.timestamp}
                  reverting={reverting}
                  onView={handleView}
                  onRevert={handleRevert}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
