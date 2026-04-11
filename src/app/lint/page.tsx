"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { LintIssue } from "@/lib/types";

interface LintResponse {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
  error?: string;
}

const severityClasses: Record<
  LintIssue["severity"],
  { badge: string; border: string }
> = {
  error: {
    badge:
      "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    border: "border-red-500/20",
  },
  warning: {
    badge:
      "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    border: "border-yellow-500/20",
  },
  info: {
    badge:
      "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
    border: "border-blue-500/20",
  },
};

/**
 * Parse the target slug from a missing-crossref lint message.
 *
 * Expected format:
 *   Page "foo.md" mentions "Bar Title" but doesn't link to bar-title.md
 *
 * Returns the target slug (e.g. "bar-title") or null if not parseable.
 */
function parseTargetSlug(message: string): string | null {
  const match = message.match(/doesn't link to ([a-z0-9][a-z0-9-]*)\.md$/);
  return match ? match[1] : null;
}

/**
 * Parse the target slug from a contradiction lint message.
 *
 * Expected format:
 *   Contradiction between slug-a, slug-b: description
 *
 * Returns the second slug (e.g. "slug-b") or null if not parseable.
 */
function parseContradictionTargetSlug(message: string): string | null {
  const match = message.match(/^Contradiction between \S+, (\S+):/);
  return match ? match[1] : null;
}

export default function LintPage() {
  const [result, setResult] = useState<LintResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingSet, setFixingSet] = useState<Set<string>>(new Set());
  const [fixMessage, setFixMessage] = useState<string | null>(null);

  async function runLint() {
    setLoading(true);
    setError(null);
    setResult(null);
    setFixMessage(null);

    try {
      const res = await fetch("/api/lint", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setResult(data);
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  const handleFix = useCallback(
    async (issue: LintIssue, targetSlug?: string) => {
      const key =
        (issue.type === "missing-crossref" || issue.type === "contradiction") && targetSlug
          ? `${issue.slug}:${targetSlug}`
          : `${issue.type}:${issue.slug}`;
      setFixingSet((prev) => new Set(prev).add(key));
      setFixMessage(null);

      try {
        // Build body depending on issue type
        const bodyObj: Record<string, string> = {
          type: issue.type,
          slug: issue.slug,
        };
        if (issue.type === "missing-crossref" && targetSlug) {
          bodyObj.targetSlug = targetSlug;
        }
        if (issue.type === "contradiction" && targetSlug) {
          bodyObj.targetSlug = targetSlug;
          bodyObj.message = issue.message;
        }

        const res = await fetch("/api/lint/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        });

        const data = await res.json();

        if (!res.ok) {
          setFixMessage(`Fix failed: ${data.error ?? "Unknown error"}`);
          return;
        }

        // Remove the fixed issue from the displayed list
        setResult((prev) => {
          if (!prev) return prev;
          const remaining = prev.issues.filter(
            (i) =>
              !(
                i.slug === issue.slug &&
                i.type === issue.type &&
                i.message === issue.message
              ),
          );
          return { ...prev, issues: remaining };
        });

        setFixMessage(data.message ?? "Fixed!");
      } catch {
        setFixMessage("Fix failed: could not connect to the server");
      } finally {
        setFixingSet((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Home
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Wiki Health Check</h1>
      <p className="mt-2 text-foreground/60">
        Run the linter to find orphan pages, missing cross-references, stale
        index entries, and other issues in your wiki.
      </p>

      <div className="mt-8">
        <button
          onClick={runLint}
          disabled={loading}
          className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Checking..." : "Run Lint"}
        </button>
      </div>

      {error && (
        <div className="mt-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={runLint}
            className="ml-4 text-sm font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      {fixMessage && (
        <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200 flex items-center justify-between">
          <span>{fixMessage}</span>
          <button
            onClick={() => setFixMessage(null)}
            className="ml-4 text-foreground/40 hover:text-foreground/70 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          {/* Summary */}
          <div className="rounded-lg border border-foreground/10 px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-foreground/80">{result.summary}</span>
            <span className="text-foreground/40 text-xs">
              {new Date(result.checkedAt).toLocaleString()}
            </span>
          </div>

          {/* Healthy state */}
          {result.issues.length === 0 && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-6 py-8 text-center">
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                ✓ Wiki is healthy! No issues found.
              </p>
            </div>
          )}

          {/* Issues list */}
          {result.issues.length > 0 && (
            <ul className="space-y-3">
              {result.issues.map((issue, i) => {
                const styles = severityClasses[issue.severity];
                const targetSlug =
                  issue.type === "missing-crossref"
                    ? parseTargetSlug(issue.message)
                    : issue.type === "contradiction"
                      ? parseContradictionTargetSlug(issue.message)
                      : null;

                const fixableTypes = new Set([
                  "missing-crossref",
                  "orphan-page",
                  "stale-index",
                  "empty-page",
                  "contradiction",
                ]);
                const isFixable =
                  fixableTypes.has(issue.type) &&
                  (issue.type !== "missing-crossref" || targetSlug !== null) &&
                  (issue.type !== "contradiction" || targetSlug !== null);

                const fixKey =
                  (issue.type === "missing-crossref" || issue.type === "contradiction") && targetSlug
                    ? `${issue.slug}:${targetSlug}`
                    : `${issue.type}:${issue.slug}`;
                const isFixing = fixingSet.has(fixKey);

                const fixLabel: Record<string, string> = {
                  "missing-crossref": "Fix",
                  "orphan-page": "Add to index",
                  "stale-index": "Remove from index",
                  "empty-page": "Delete page",
                  "contradiction": "Resolve",
                };

                return (
                  <li
                    key={`${issue.slug}-${issue.type}-${i}`}
                    className={`rounded-lg border ${styles.border} p-4 flex flex-wrap items-start gap-2`}
                  >
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles.badge}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="inline-block rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground/70">
                      {issue.type}
                    </span>
                    {issue.slug ? (
                      <Link
                        href={`/wiki/${issue.slug}`}
                        className="inline-block rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-foreground/10 transition-colors"
                      >
                        {issue.slug}
                      </Link>
                    ) : (
                      <span className="inline-block rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground/60">
                        system
                      </span>
                    )}
                    {isFixable && (
                      <button
                        onClick={() => handleFix(issue, targetSlug ?? undefined)}
                        disabled={isFixing}
                        className={`ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          issue.type === "empty-page"
                            ? "border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400"
                            : "border-foreground/20 bg-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                        }`}
                      >
                        {isFixing ? "Fixing…" : fixLabel[issue.type] ?? "Fix"}
                      </button>
                    )}
                    <span className="basis-full text-sm text-foreground/80 mt-1">
                      {issue.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
