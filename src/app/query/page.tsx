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
import type { QueryFormat } from "@/lib/query-format";
import { Icon } from "@/components/folio/icons";
import { logger } from "@/lib/logger";

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
    async (
      q: string,
      answer: string,
      sources: string[],
      fmt: QueryFormat,
    ) => {
      try {
        const res = await fetch("/api/query/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, answer, sources, format: fmt }),
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

  // Public + your-vaults lens. Default scope = undefined (the public commons).
  // A `?scope=owner:<h>` / `agent:<id>` deep-link (e.g. from a /u/<handle> silo)
  // takes precedence and pins the query to that scope.
  const { isLoaded, isSignedIn } = useUser();

  // The signed-in user's vaults, for the lens selector (fetched on mount).
  const [myVaults, setMyVaults] = useState<
    { id: string; name: string }[]
  >([]);
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/vaults")
      .then((r) => (r.ok ? r.json() : { vaults: [] }))
      .then((d: { vaults?: { id: string; name: string }[] }) => {
        if (!cancelled) setMyVaults(d.vaults ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Example questions reference existing pages — hide them when the commons is
  // empty (assume content until proven otherwise, so they don't flash away).
  const [hasContent, setHasContent] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/wiki")
      .then((r) => {
        if (!r.ok) {
          logger.warn("query", `/api/wiki returned ${r.status}; keeping chips`);
          return null; // unknown — leave the default (shown), don't hide
        }
        return r.json();
      })
      .then((d: { pages?: unknown[] } | null) => {
        // Only flip on a definitive answer; on error/uncertainty keep chips shown.
        if (!cancelled && d) setHasContent((d.pages?.length ?? 0) > 0);
      })
      .catch((err) => {
        if (!cancelled) logger.warn("query", "chip-gating /api/wiki fetch failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    runQuery,
    isProcessing,
  } = useStreamingQuery({
    onComplete: saveToHistory,
    onSubmitStart: () => setCurrentHistoryId(null),
  });

  // Set the initial scope once, on first Clerk load: a `?scope=` deep-link wins;
  // otherwise default = undefined (the public commons). Reads location directly
  // (not useSearchParams) to avoid a client-side-rendering bailout of the page.
  const didInitScope = useRef(false);
  useEffect(() => {
    if (didInitScope.current || !isLoaded) return;
    didInitScope.current = true;
    const deepLink =
      new URLSearchParams(window.location.search).get("scope") || undefined;
    if (deepLink) setScope(deepLink);
  }, [isLoaded, setScope]);

  // Handle a deep link once on load:
  //   ?q=…   → AUTO-RUN the query (e.g. the homepage Ask, which carries a full
  //            question). Any `?scope=` is read straight from the URL and passed
  //            to runQuery so the run uses the right scope without waiting on the
  //            scope-init effect's setScope() to land in state.
  //   ?ask=… → PREFILL the box but do NOT run — for "Ask about this page", which
  //            seeds only a `About "…": ` prefix the user still has to complete.
  //            Focus the textarea with the cursor at the end so they can type on.
  // Strips the param from the URL afterward so a refresh doesn't re-trigger.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didInitQuestion = useRef(false);
  useEffect(() => {
    if (didInitQuestion.current || !isLoaded) return;
    didInitQuestion.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const ask = params.get("ask");
    if (!q && !ask) return;
    if (q) {
      runQuery(q, params.get("scope") || undefined);
    } else if (ask) {
      setQuestion(ask);
      // Focus + cursor-to-end after the value lands, so typing continues the seed.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(ask.length, ask.length);
      });
    }
    params.delete("q");
    params.delete("ask");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : ""),
    );
  }, [isLoaded, runQuery, setQuestion]);

  // A deep-linked owner:<handle> scope renders as a dismissible chip; otherwise
  // the Public + your-vaults selector drives `scope` (undefined=Public vs
  // `vault:<id>`).
  const scopedHandle = scope?.startsWith("owner:")
    ? scope.slice("owner:".length)
    : null;
  const activeVaultId = scope?.startsWith("vault:")
    ? scope.slice("vault:".length)
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
    // Restore the answer's format so an HTML answer re-renders in the sandboxed
    // iframe (not as escaped markdown). Legacy entries lack it → default "prose";
    // QueryResultPanel's content sniff still catches recognizable raw HTML.
    setFormat(entry.format ?? "prose");
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
    <main className="mx-auto max-w-4xl px-6" style={{ paddingTop: 64, paddingBottom: 88 }}>
      <p className="fmark" style={{ marginBottom: 18 }}>
        ask the accumulated brain
      </p>

      {/* Scope lens — a pinned silo/agent (deep-link) renders as a dismissible
          chip; otherwise a Public + your-vaults selector. */}
      <div style={{ marginTop: 16 }}>
        {scopedHandle ? (
          <div
            className="row"
            style={{
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              border: "1px solid var(--rule)",
              background: "var(--paper-2)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--muted)" }}>
              Answering from{" "}
              <Link
                href={`/u/${scopedHandle}`}
                style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "none" }}
              >
                @{scopedHandle}
              </Link>
              ’s pages
            </span>
            <button
              type="button"
              onClick={() => setScope(undefined)}
              style={{ color: "var(--muted)", background: "transparent", border: 0, cursor: "pointer" }}
              aria-label="Clear scope and search all content"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            role="group"
            aria-label="Query scope"
            className="row"
            style={{ gap: 6, flexWrap: "wrap" }}
          >
            {[
              { scope: undefined as string | undefined, label: "Public", active: !activeVaultId },
              ...myVaults.map((v) => ({
                scope: `vault:${v.id}` as string | undefined,
                label: v.name,
                active: activeVaultId === v.id,
              })),
            ].map((o) => (
              <button
                key={o.scope ?? "all"}
                type="button"
                onClick={() => setScope(o.scope)}
                style={{
                  fontSize: 13,
                  padding: "5px 12px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  border: `1px solid ${o.active ? "var(--ink)" : "var(--rule)"}`,
                  background: o.active ? "var(--ink)" : "transparent",
                  color: o.active ? "var(--paper)" : "var(--ink-2)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Centered single column (the right-hand history sidebar moved below). */}
      <div className="mt-7">
        <div>
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
                  ref={textareaRef}
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
                  {hasContent &&
                    EXAMPLES.map((ex) => (
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

            {/* Why an answer here is trustworthy — grounded, cited, scored. */}
            <p
              style={{
                fontFamily: "var(--font-read)",
                fontStyle: "italic",
                fontSize: 21,
                lineHeight: 1.55,
                color: "var(--ink-2)",
                maxWidth: "62ch",
                margin: "22px 4px 0",
              }}
            >
              Unlike a chat, an answer here is grounded in the commons — it cites
              the pages it stands on, with each page&apos;s confidence shown, so
              you can trace and trust it.
            </p>

            {/* Answer format */}
            <fieldset
              className="row"
              style={{ gap: 8, marginTop: 18, flexWrap: "wrap" }}
            >
              <legend className="sr-only">Answer format</legend>
              <span className="fmark" style={{ marginRight: 4 }}>
                format
              </span>
              {(["prose", "table", "slides", "html"] as const).map((f) => {
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
              format={format}
            />
          )}
        </div>

        {/* Recent queries — below the answer (was a right-hand sidebar). */}
        <div style={{ marginTop: 48 }}>
          <QueryHistorySidebar
            history={history}
            loading={historyLoading}
            currentId={currentHistoryId}
            onSelect={loadHistoryEntry}
          />
        </div>
      </div>
    </main>
  );
}
