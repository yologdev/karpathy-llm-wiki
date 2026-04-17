"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Alert } from "@/components/Alert";

interface SaveState {
  status: "idle" | "editing" | "saving" | "saved" | "error";
  slug?: string;
  error?: string;
}

export interface QueryResultPanelProps {
  result: { answer: string; sources: string[] };
  streaming: boolean;
  question: string;
  currentHistoryId: string | null;
  onHistorySaved?: (id: string, slug: string) => void;
}

export function QueryResultPanel({
  result,
  streaming,
  question,
  currentHistoryId,
  onHistorySaved,
}: QueryResultPanelProps) {
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [saveTitle, setSaveTitle] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  // Reset save state when result changes (new query)
  useEffect(() => {
    setSaveState({ status: "idle" });
  }, [result.answer]);

  // Reset copy-button label back to "idle" ~2s after a copy attempt.
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const handleCopyMarkdown = useCallback(async () => {
    const lines = [`# ${question.trim()}`, "", result.answer];
    if (result.sources.length > 0) {
      lines.push("", "## Sources", "");
      for (const slug of result.sources) lines.push(`- [[${slug}]]`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyState("copied");
    } catch (err) {
      console.error("[query] copy failed:", err);
      setCopyState("error");
    }
  }, [result, question]);

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
          onHistorySaved?.(currentHistoryId, data.slug);
        } catch {
          // Non-critical
        }
      }
    } catch {
      setSaveState({
        status: "error",
        error: "Failed to connect to the server",
      });
    }
  }

  /** Allow external callers to set save state (e.g. loading from history). */
  // This is handled via the useEffect reset above + parent re-rendering with new props.

  return (
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
        <div className="border-t border-foreground/10 pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium hover:bg-foreground/5 transition-colors"
            >
              {copyState === "copied"
                ? "Copied!"
                : copyState === "error"
                  ? "Copy failed"
                  : "Copy as Markdown"}
            </button>
            {saveState.status === "idle" && (
              <button
                onClick={handleSaveClick}
                className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium hover:bg-foreground/5 transition-colors"
              >
                Save to Wiki
              </button>
            )}
          </div>

          {saveState.status === "editing" && (
            <form onSubmit={handleSaveSubmit} className="space-y-3">
              <label
                htmlFor="save-title"
                className="block text-sm font-medium text-foreground/70"
              >
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
  );
}
