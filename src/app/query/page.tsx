"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Alert } from "@/components/Alert";
import {
  QueryHistorySidebar,
  type HistoryEntry,
} from "@/components/QueryHistorySidebar";
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

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [format, setFormat] = useState<"prose" | "table">("prose");
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
          body: JSON.stringify({ question: trimmed, format }),
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
            body: JSON.stringify({ question: trimmed, format }),
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
    [question, format, saveToHistory],
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
              aria-label="Your question"
              rows={3}
              className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/30 resize-vertical"
            />
            <fieldset className="flex items-center gap-4 text-sm">
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
                    <Alert variant="success">
                      Saved!{" "}
                      <Link
                        href={`/wiki/${saveState.slug}`}
                        className="underline font-medium hover:opacity-80"
                      >
                        View wiki page →
                      </Link>
                    </Alert>
                  )}

                  {saveState.status === "error" && (
                    <div className="space-y-2">
                      <Alert variant="error">
                        {saveState.error ?? "Failed to save"}
                      </Alert>
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
