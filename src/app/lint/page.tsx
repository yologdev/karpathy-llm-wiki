"use client";

import { useState } from "react";
import Link from "next/link";

interface LintIssue {
  type: "orphan-page" | "stale-index" | "missing-crossref" | "empty-page";
  slug: string;
  message: string;
  severity: "error" | "warning" | "info";
}

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

export default function LintPage() {
  const [result, setResult] = useState<LintResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runLint() {
    setLoading(true);
    setError(null);
    setResult(null);

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
                    <Link
                      href={`/wiki/${issue.slug}`}
                      className="inline-block rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-foreground/10 transition-colors"
                    >
                      {issue.slug}
                    </Link>
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
