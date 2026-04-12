"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { extractCitedSlugs } from "@/lib/citations";

interface QueryResponse {
  answer: string;
  sources: string[];
  error?: string;
}

interface SaveState {
  status: "idle" | "editing" | "saving" | "saved" | "error";
  slug?: string;
  error?: string;
}

interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  timestamp: string;
  savedAs?: string;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [saveTitle, setSaveTitle] = useState("");

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // Ref to hold the current AbortController for streaming requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch history on mount
  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/query/history?limit=20");
        if (res.ok) {
          const data = await res.json();
          setHistory(data.entries ?? []);
        }
      } catch {
        // Silently fail — history is non-critical
      } finally {
        setHistoryLoading(false);
      }
    }
    fetchHistory();
  }, []);

  // Abort any in-flight streaming request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  /** Save a completed query to history and refresh the list. */
  const saveToHistory = useCallback(
    async (q: string, answer: string, sources: string[]) => {
      try {
        const res = await fetch("/api/query/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, answer, sources }),
        });
        if (res.ok) {
          const data = await res.json();
          const newEntry: HistoryEntry = data.entry;
          setCurrentHistoryId(newEntry.id);
          // Prepend to local history list
          setHistory((prev) => [newEntry, ...prev].slice(0, 20));
        }
      } catch {
        // Non-critical — don't interrupt the user
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!question.trim()) return;

      // Abort any previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setStreaming(false);
      setError(null);
      setResult(null);
      setSaveState({ status: "idle" });
      setCurrentHistoryId(null);

      const trimmed = question.trim();

      try {
        // Try the streaming endpoint first
        const res = await fetch("/api/query/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Streaming endpoint failed — try non-streaming fallback
          const data = await res.json().catch(() => null);
          const errMsg = data?.error ?? `Request failed (${res.status})`;

          // Fall back to non-streaming endpoint
          const fallbackRes = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: trimmed }),
            signal: controller.signal,
          });

          const fallbackData = await fallbackRes.json();
          if (!fallbackRes.ok) {
            setError(fallbackData.error ?? errMsg);
            return;
          }
          setResult(fallbackData);
          // Save to history
          await saveToHistory(
            trimmed,
            fallbackData.answer,
            fallbackData.sources,
          );
          return;
        }

        // Parse sources from the custom header
        const sourcesHeader = res.headers.get("X-Wiki-Sources");
        let sources: string[] = [];
        if (sourcesHeader) {
          try {
            sources = JSON.parse(sourcesHeader) as string[];
          } catch {
            // Malformed header — fall back to empty array
            sources = [];
          }
        }

        // Stream the response body
        const reader = res.body?.getReader();
        if (!reader) {
          setError("Streaming not supported by the browser");
          return;
        }

        setStreaming(true);
        setLoading(false);

        const decoder = new TextDecoder();
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          answer += chunk;
          setResult({ answer, sources });
        }

        // Refine sources to only those actually cited in the answer
        const citedSources = extractCitedSlugs(answer, sources);
        // Fall back to loaded sources if no citations detected (defensive)
        const finalSources =
          citedSources.length > 0 ? citedSources : sources;
        setResult({ answer, sources: finalSources });
        setStreaming(false);

        // Save to history after streaming completes
        await saveToHistory(trimmed, answer, finalSources);
      } catch (err) {
        // Don't report abort errors as failures
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError("Failed to connect to the server");
      } finally {
        setLoading(false);
        setStreaming(false);
      }
    },
    [question, saveToHistory],
  );

  /** Load a history entry into the UI without re-querying. */
  function loadHistoryEntry(entry: HistoryEntry) {
    setQuestion(entry.question);
    setResult({ answer: entry.answer, sources: entry.sources });
    setError(null);
    setLoading(false);
    setStreaming(false);
    setCurrentHistoryId(entry.id);
    setSaveState(
      entry.savedAs
        ? { status: "saved", slug: entry.savedAs }
        : { status: "idle" },
    );
  }

  function handleSaveClick() {
    setSaveTitle(question.trim());
    setSaveState({ status: "editing" });
  }

  async function handleSaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!saveTitle.trim() || !result) return;

    setSaveState({ status: "saving" });

    try {
      const res = await fetch("/api/query/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle.trim(),
          content: result.answer,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveState({ status: "error", error: data.error ?? "Save failed" });
        return;
      }

      setSaveState({ status: "saved", slug: data.slug });

      // Mark the history entry as saved
      if (currentHistoryId) {
        try {
          await fetch("/api/query/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "markSaved",
              id: currentHistoryId,
              slug: data.slug,
            }),
          });
          // Update local history state
          setHistory((prev) =>
            prev.map((h) =>
              h.id === currentHistoryId ? { ...h, savedAs: data.slug } : h,
            ),
          );
        } catch {
          // Non-critical
        }
      }
    } catch {
      setSaveState({ status: "error", error: "Failed to connect to the server" });
    }
  }

  const isProcessing = loading || streaming;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Ask the Wiki</h1>
      <p className="mt-2 text-foreground/60">
        Ask a question and get a cited answer drawn from your wiki pages.
      </p>

      <div className="mt-8 flex flex-col lg:flex-row gap-8">
        {/* Main query area */}
        <div className="flex-1 min-w-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to know?"
              rows={3}
              className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/30 resize-vertical"
            />
            <button
              type="submit"
              disabled={isProcessing || !question.trim()}
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Searching wiki..."
                : streaming
                  ? "Streaming answer..."
                  : "Ask"}
            </button>
          </form>

          {error && (
            <div className="mt-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-8 space-y-6">
              <div className="rounded-lg border border-foreground/10 p-6">
                <MarkdownRenderer content={result.answer} />
                {streaming && (
                  <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>

              {result.sources.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
                    Sources
                  </h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {result.sources.map((slug) => (
                      <li key={slug}>
                        <Link
                          href={`/wiki/${slug}`}
                          className="inline-block rounded-md border border-foreground/20 px-3 py-1 text-sm hover:bg-foreground/5 transition-colors"
                        >
                          {slug}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Save to Wiki — only after streaming completes */}
              {!streaming && (
                <div className="border-t border-foreground/10 pt-4">
                  {saveState.status === "idle" && (
                    <button
                      onClick={handleSaveClick}
                      className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium hover:bg-foreground/5 transition-colors"
                    >
                      Save to Wiki
                    </button>
                  )}

                  {saveState.status === "editing" && (
                    <form onSubmit={handleSaveSubmit} className="space-y-3">
                      <label htmlFor="save-title" className="block text-sm font-medium text-foreground/70">
                        Page title
                      </label>
                      <input
                        id="save-title"
                        type="text"
                        value={saveTitle}
                        onChange={(e) => setSaveTitle(e.target.value)}
                        placeholder="Enter a title for this wiki page"
                        className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/30"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={!saveTitle.trim()}
                          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setSaveState({ status: "idle" })}
                          className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium hover:bg-foreground/5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {saveState.status === "saving" && (
                    <p className="text-sm text-foreground/60">Saving to wiki...</p>
                  )}

                  {saveState.status === "saved" && saveState.slug && (
                    <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                      Saved!{" "}
                      <Link
                        href={`/wiki/${saveState.slug}`}
                        className="underline font-medium hover:opacity-80"
                      >
                        View wiki page →
                      </Link>
                    </div>
                  )}

                  {saveState.status === "error" && (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                        {saveState.error ?? "Failed to save"}
                      </div>
                      <button
                        onClick={handleSaveClick}
                        className="text-sm text-foreground/60 hover:text-foreground underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* History sidebar */}
        <aside className="lg:w-72 shrink-0">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-3">
            Recent Queries
          </h2>
          {historyLoading ? (
            <p className="text-xs text-foreground/40">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-foreground/40">
              No queries yet. Ask something!
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => loadHistoryEntry(entry)}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-foreground/5 ${
                      currentHistoryId === entry.id
                        ? "border-foreground/40 bg-foreground/5"
                        : "border-foreground/10"
                    }`}
                  >
                    <span className="block truncate font-medium">
                      {truncate(entry.question, 80)}
                    </span>
                    <span className="flex items-center gap-2 mt-1 text-xs text-foreground/50">
                      <span>{relativeTime(entry.timestamp)}</span>
                      {entry.sources.length > 0 && (
                        <span>
                          {entry.sources.length} source
                          {entry.sources.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {entry.savedAs && (
                        <span className="text-green-600 dark:text-green-400">
                          saved
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
