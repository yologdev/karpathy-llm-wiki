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
import { Icon } from "@/components/folio/icons";

const EXAMPLES = [
  "What is harness engineering?",
  "How is yopedia different from RAG?",
  "What are the agentic harness patterns?",
];

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
    <main className="mx-auto max-w-4xl px-6" style={{ paddingTop: 56, paddingBottom: 80 }}>
      <p className="fmark" style={{ marginBottom: 18 }}>
        ask the accumulated brain
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
          <form onSubmit={submit}>
            <div
              style={{
                border: "1px solid var(--rule-strong)",
                borderRadius: 18,
                background: "var(--paper-2)",
                boxShadow: "var(--shadow)",
                overflow: "hidden",
              }}
            >
              <div
                className="row"
                style={{ gap: 14, padding: "20px 22px 8px", alignItems: "flex-start" }}
              >
                <span style={{ color: "var(--accent)", paddingTop: 4 }}>
                  <Icon.spark width="22" height="22" />
                </span>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Ask the commons a question…"
                  aria-label="Your question"
                  rows={2}
                  style={{
                    flex: 1,
                    border: 0,
                    outline: 0,
                    resize: "none",
                    background: "transparent",
                    fontFamily: "var(--font-read)",
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: "var(--ink)",
                  }}
                  className="placeholder:text-faint"
                />
              </div>
              <div
                className="spread"
                style={{
                  padding: "12px 16px 14px 22px",
                  borderTop: "1px solid var(--rule)",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  className="row"
                  style={{ gap: 8, flexWrap: "wrap", flex: "1 1 320px", minWidth: 0 }}
                >
                  {EXAMPLES.map((ex) => (
                    <button
                      type="button"
                      key={ex}
                      onClick={() => setQuestion(ex)}
                      className="receipt folio-chip"
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        background: "transparent",
                        whiteSpace: "nowrap",
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        padding: "5px 11px",
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={isProcessing || !question.trim()}
                  className="btn primary shrink-0 disabled:opacity-50"
                >
                  {loading ? "Searching…" : streaming ? "Streaming…" : "Ask"}
                  {!isProcessing && <Icon.arrow width="16" height="16" />}
                </button>
              </div>
            </div>

            {/* Answer format */}
            <fieldset
              className="row"
              style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}
            >
              <legend className="sr-only">Answer format</legend>
              <span className="fmark" style={{ marginRight: 4 }}>
                format
              </span>
              {(["prose", "table", "slides"] as const).map((f) => {
                const active = format === f;
                return (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setFormat(f)}
                    disabled={isProcessing}
                    className="receipt"
                    style={{
                      fontSize: 12,
                      padding: "4px 12px",
                      borderRadius: 999,
                      textTransform: "capitalize",
                      transition: "all .15s",
                      border: `1px solid ${active ? "var(--ink)" : "var(--rule)"}`,
                      background: active ? "var(--ink)" : "transparent",
                      color: active ? "var(--paper)" : "var(--ink-2)",
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </fieldset>
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
