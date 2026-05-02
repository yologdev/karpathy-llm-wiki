"use client";

import { useState, useCallback } from "react";
import type { TalkThread } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { ThreadForm } from "./ThreadForm";
import { ThreadView } from "./ThreadView";

interface DiscussionPanelProps {
  slug: string;
}

const STATUS_COLORS: Record<TalkThread["status"], string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  wontfix: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function StatusBadge({ status }: { status: TalkThread["status"] }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {status === "wontfix" ? "won't fix" : status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main DiscussionPanel
// ---------------------------------------------------------------------------

/**
 * Collapsible discussion panel for a wiki page's talk threads.
 *
 * Follows the same pattern as RevisionHistory — fetches on demand when the
 * user expands the section, manages all state client-side.
 */
export function DiscussionPanel({ slug }: DiscussionPanelProps) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<TalkThread[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded thread detail
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [expandedThread, setExpandedThread] = useState<TalkThread | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New thread form
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Reply-to-comment state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replySubmitting, setReplySubmitting] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(slug)}/discuss`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to load discussions (${res.status})`);
      }
      const data = (await res.json()) as { threads: TalkThread[] };
      setThreads(data.threads);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && threads === null && !loading) {
      fetchThreads();
    }
  }

  async function refreshThread(idx: number) {
    setExpandedIdx(idx);
    setExpandedThread(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(slug)}/discuss/${idx}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to load thread (${res.status})`);
      }
      const data = (await res.json()) as { thread: TalkThread };
      setExpandedThread(data.thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setExpandedIdx(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExpandThread(idx: number) {
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      setExpandedThread(null);
      return;
    }
    setReplyingTo(null);
    await refreshThread(idx);
  }

  async function handleCreateThread(title: string, author: string, body: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(slug)}/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, body }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `Failed to create thread (${res.status})`);
      }
      setShowNewForm(false);
      await fetchThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      // Re-throw so ThreadForm doesn't clear its fields on failure
      throw err;
    } finally {
      setCreating(false);
    }
  }

  async function handleAddComment(author: string, body: string) {
    if (expandedIdx === null) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/wiki/${encodeURIComponent(slug)}/discuss/${expandedIdx}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ author, body }),
        },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `Failed to add comment (${res.status})`);
      }
      // Refresh expanded thread without toggling
      await refreshThread(expandedIdx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    }
  }

  async function handleReplySubmit(parentId: string, author: string, body: string) {
    if (expandedIdx === null) return;
    setReplySubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/wiki/${encodeURIComponent(slug)}/discuss/${expandedIdx}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ author, body, parentId }),
        },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `Failed to add reply (${res.status})`);
      }
      setReplyingTo(null);
      await refreshThread(expandedIdx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReplySubmitting(false);
    }
  }

  async function handleResolve(idx: number, newStatus: "resolved" | "wontfix") {
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(slug)}/discuss/${idx}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to update thread (${res.status})`);
      }
      await fetchThreads();
      if (expandedIdx === idx) {
        await refreshThread(idx);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  const threadCount = threads?.length ?? 0;
  const inputClasses = "w-full rounded border border-foreground/10 bg-transparent px-2 py-1 text-sm focus:border-foreground/30 focus:outline-none";

  return (
    <section className="mt-6 border-t border-foreground/10 pt-6">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls="discussion-panel"
        className="flex items-center gap-2 text-sm font-medium text-foreground/50 uppercase tracking-wide hover:text-foreground/70 transition-colors"
      >
        {/* Chat bubble icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Discussion{threads !== null ? ` (${threadCount})` : ""}
        <span className="text-xs font-normal">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div id="discussion-panel" className="mt-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
          )}

          {loading && (
            <p className="text-sm text-foreground/50">Loading discussions…</p>
          )}

          {/* New thread button / form */}
          {!loading && threads !== null && (
            <div>
              {!showNewForm ? (
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  + New thread
                </button>
              ) : (
                <ThreadForm
                  onSubmit={handleCreateThread}
                  onCancel={() => setShowNewForm(false)}
                  creating={creating}
                  inputClasses={inputClasses}
                />
              )}
            </div>
          )}

          {/* Thread list */}
          {!loading && threads !== null && threadCount === 0 && (
            <p className="text-sm text-foreground/50">No discussions yet.</p>
          )}

          {!loading && threads !== null && threadCount > 0 && (
            <ul className="space-y-2">
              {threads.map((thread, idx) => (
                <li key={`${thread.created}-${idx}`} className="rounded border border-foreground/10 p-3">
                  <button
                    type="button"
                    onClick={() => handleExpandThread(idx)}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span className="text-xs font-normal">{expandedIdx === idx ? "▼" : "▶"}</span>
                    <span className="flex-1 text-sm font-medium">{thread.title}</span>
                    <StatusBadge status={thread.status} />
                    <span className="text-xs text-foreground/40">{thread.comments.length} comment{thread.comments.length !== 1 ? "s" : ""}</span>
                    <span className="text-xs text-foreground/40">{formatRelativeTime(thread.updated)}</span>
                  </button>

                  {/* Expanded thread detail */}
                  {expandedIdx === idx && expandedThread && (
                    <ThreadView
                      thread={expandedThread}
                      replyingTo={replyingTo}
                      replySubmitting={replySubmitting}
                      onReplyClick={(id) => setReplyingTo(replyingTo === id ? null : id)}
                      onCancelReply={() => setReplyingTo(null)}
                      onSubmitReply={handleReplySubmit}
                      onResolve={(status) => handleResolve(idx, status)}
                      onAddComment={handleAddComment}
                      inputClasses={inputClasses}
                    />
                  )}

                  {/* Show loading state when thread is expanding but not yet loaded */}
                  {expandedIdx === idx && !expandedThread && detailLoading && (
                    <div className="mt-3 space-y-3 border-t border-foreground/10 pt-3">
                      <p className="text-sm text-foreground/50">Loading thread…</p>
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
