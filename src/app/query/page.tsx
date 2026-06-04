"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Alert } from "@/components/Alert";
import {
  QueryHistorySidebar,
  type HistoryEntry,
} from "@/components/QueryHistorySidebar";
import { QueryResultPanel } from "@/components/QueryResultPanel";
import { useStreamingQuery } from "@/hooks/useStreamingQuery";

export default function QueryPage() {
  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

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

  // Mine|All lens — querying requires sign-in (API write gate), so signed-in
  // users default to "mine" (their own pages). A `?scope=owner:<h>` deep-link
  // (from a /u/<handle> silo) takes precedence and pins the query to that silo.
  const { isLoaded, isSignedIn } = useUser();

  const {
    question,
    setQuestion,
    format,
    setFormat,
    scope,
    setScope,
    result,
    setResult,
    loading,
    setLoading,
    streaming,
    setStreaming,
    error,
    setError,
    submit,
    isProcessing,
  } = useStreamingQuery({
    onComplete: saveToHistory,
    onSubmitStart: () => setCurrentHistoryId(null),
  });

  // Set the initial scope once, on first Clerk load: a `?scope=` deep-link wins;
  // otherwise signed-in users default to "mine". Reads location directly (not
  // useSearchParams) to avoid a client-side-rendering bailout of the page.
  const didInitScope = useRef(false);
  useEffect(() => {
    if (didInitScope.current || !isLoaded) return;
    didInitScope.current = true;
    const deepLink =
      new URLSearchParams(window.location.search).get("scope") || undefined;
    if (deepLink) setScope(deepLink);
    else if (isSignedIn) setScope("mine");
  }, [isLoaded, isSignedIn, setScope]);

  // A deep-linked owner:<handle> scope renders as a dismissible chip; otherwise
  // the Mine|All toggle drives `scope` ("mine" vs undefined=All).
  const scopedHandle = scope?.startsWith("owner:")
    ? scope.slice("owner:".length)
    : null;

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

  /** Load a history entry into the UI without re-querying. */
  function loadHistoryEntry(entry: HistoryEntry) {
    setQuestion(entry.question);
    setResult({ answer: entry.answer, sources: entry.sources });
    setError(null);
    setLoading(false);
    setStreaming(false);
    setCurrentHistoryId(entry.id);
  }

  /** Called when a save-to-wiki completes inside QueryResultPanel. */
  function handleHistorySaved(id: string, slug: string) {
    setHistory((prev) =>
      prev.map((h) => (h.id === id ? { ...h, savedAs: slug } : h)),
    );
  }

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

      {/* Scope lens — pinned silo (deep-link) renders as a chip; otherwise a
          Mine|All toggle. "Mine" is shown only when signed in. */}
      <div className="mt-4">
        {scopedHandle ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-1.5 text-sm">
            <span className="text-foreground/70">
              Answering from{" "}
              <Link
                href={`/u/${scopedHandle}`}
                className="font-medium text-foreground hover:underline"
              >
                @{scopedHandle}
              </Link>
              ’s pages
            </span>
            <button
              type="button"
              onClick={() => setScope(undefined)}
              className="text-foreground/50 hover:text-foreground"
              aria-label="Clear scope and search all content"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            role="group"
            aria-label="Query scope"
            className="inline-flex items-center gap-1 rounded-lg border border-foreground/10 p-1"
          >
            {isSignedIn && (
              <button
                type="button"
                onClick={() => setScope("mine")}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  scope === "mine"
                    ? "bg-foreground/10 font-semibold text-foreground"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                Mine
              </button>
            )}
            <button
              type="button"
              onClick={() => setScope(undefined)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                scope === undefined
                  ? "bg-foreground/10 font-semibold text-foreground"
                  : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              All
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col lg:flex-row gap-8">
        {/* Main query area */}
        <div className="flex-1 min-w-0">
          <form onSubmit={submit} className="space-y-4">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to know?"
              aria-label="Your question"
              rows={3}
              className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/30 resize-vertical"
            />
            <fieldset className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
              <legend className="sr-only">Answer format</legend>
              <span className="text-foreground/60">Answer format:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="prose"
                  checked={format === "prose"}
                  onChange={() => setFormat("prose")}
                  disabled={isProcessing}
                />
                <span>Prose</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="table"
                  checked={format === "table"}
                  onChange={() => setFormat("table")}
                  disabled={isProcessing}
                />
                <span>Table</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="slides"
                  checked={format === "slides"}
                  onChange={() => setFormat("slides")}
                  disabled={isProcessing}
                />
                <span>Slides</span>
              </label>
            </fieldset>
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
            <Alert variant="error" className="mt-8">
              {error}
            </Alert>
          )}

          {result && (
            <QueryResultPanel
              result={result}
              streaming={streaming}
              question={question}
              currentHistoryId={currentHistoryId}
              onHistorySaved={handleHistorySaved}
            />
          )}
        </div>

        {/* History sidebar */}
        <QueryHistorySidebar
          history={history}
          loading={historyLoading}
          currentId={currentHistoryId}
          onSelect={loadHistoryEntry}
        />
      </div>
    </main>
  );
}
