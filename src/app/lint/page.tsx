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

/**
 * Parse the target slug from a broken-link lint message.
 *
 * Expected format:
 *   Page "foo.md" links to "nonexistent.md" which does not exist
 *
 * Returns the target slug (e.g. "nonexistent") or null if not parseable.
 */
function parseTargetSlugFromBrokenLink(message: string): string | null {
  const match = message.match(/links to "([a-z0-9][a-z0-9-]*)\.md" which does not exist$/);
  return match ? match[1] : null;
}

export default function LintPage() {
  const [result, setResult] = useState<LintResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingSet, setFixingSet] = useState<Set<string>>(new Set());
  const [fixMessages, setFixMessages] = useState<Map<string, string>>(new Map());

  async function runLint() {
    setLoading(true);
    setError(null);
    setResult(null);
    setFixMessages(new Map());

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
        (issue.type === "missing-crossref" || issue.type === "contradiction" || issue.type === "broken-link") && targetSlug
          ? `${issue.slug}:${targetSlug}`
          : issue.type === "missing-concept-page"
            ? `missing-concept-page:${issue.message}`
            : `${issue.type}:${issue.slug}`;
      setFixingSet((prev) => new Set(prev).add(key));

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
        if (issue.type === "missing-concept-page") {
          bodyObj.message = issue.message;
        }
        if (issue.type === "broken-link" && targetSlug) {
          bodyObj.targetSlug = targetSlug;
        }

        const res = await fetch("/api/lint/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        });

        const data = await res.json();

        if (!res.ok) {
          setFixMessages((prev) => {
            const next = new Map(prev);
            next.set(key, `Fix failed: ${data.error ?? "Unknown error"}`);
            return next;
          });
          setTimeout(() => {
            setFixMessages((prev) => {
              const next = new Map(prev);
              next.delete(key);
              return next;
            });
          }, 5000);
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

        setFixMessages((prev) => {
          const next = new Map(prev);
          next.set(key, data.message ?? "Fixed!");
          return next;
        });
        setTimeout(() => {
          setFixMessages((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }, 5000);
      } catch {
        setFixMessages((prev) => {
          const next = new Map(prev);
          next.set(key, "Fix failed: could not connect to the server");
          return next;
        });
        setTimeout(() => {
          setFixMessages((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }, 5000);
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
                      : issue.type === "broken-link"
                        ? parseTargetSlugFromBrokenLink(issue.message)
                        : null;

                const fixableTypes = new Set([
                  "missing-crossref",
                  "orphan-page",
                  "stale-index",
                  "empty-page",
                  "contradiction",
                  "missing-concept-page",
                  "broken-link",
                ]);
                const isFixable =
                  fixableTypes.has(issue.type) &&
                  (issue.type !== "missing-crossref" || targetSlug !== null) &&
                  (issue.type !== "contradiction" || targetSlug !== null) &&
                  (issue.type !== "missing-concept-page" || issue.message.startsWith('Concept "')) &&
                  (issue.type !== "broken-link" || targetSlug !== null);

                const fixKey =
                  (issue.type === "missing-crossref" || issue.type === "contradiction" || issue.type === "broken-link") && targetSlug
                    ? `${issue.slug}:${targetSlug}`
                    : issue.type === "missing-concept-page"
                      ? `missing-concept-page:${issue.message}`
                      : `${issue.type}:${issue.slug}`;
                const isFixing = fixingSet.has(fixKey);
                const fixMsg = fixMessages.get(fixKey);

                const fixLabel: Record<string, string> = {
                  "missing-crossref": "Fix",
                  "orphan-page": "Add to index",
                  "stale-index": "Remove from index",
                  "empty-page": "Delete page",
                  "contradiction": "Resolve",
                  "missing-concept-page": "Create page",
                  "broken-link": "Remove link",
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
                    {fixMsg && (
                      <span
                        className={`ml-2 text-xs ${
                          fixMsg.startsWith("Fix failed")
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        }`}
                      >
                        {fixMsg}
                      </span>
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
