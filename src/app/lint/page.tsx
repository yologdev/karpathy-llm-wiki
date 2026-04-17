"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type { LintIssue } from "@/lib/types";
import {
  LintFilterControls,
  ALL_CHECK_TYPES,
  type SeverityFilter,
} from "@/components/LintFilterControls";
import { LintIssueCard } from "@/components/LintIssueCard";

interface LintResponse {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
  error?: string;
}

export default function LintPage() {
  const [result, setResult] = useState<LintResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingSet, setFixingSet] = useState<Set<string>>(new Set());
  const [fixMessages, setFixMessages] = useState<Map<string, string>>(new Map());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Filter state
  const [enabledChecks, setEnabledChecks] = useState<Set<LintIssue["type"]>>(
    new Set(ALL_CHECK_TYPES),
  );
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  // Clear all pending timeouts on unmount
  useEffect(() => {
    return () => {
      for (const id of timeoutsRef.current) {
        clearTimeout(id);
      }
    };
  }, []);

  /** Schedule a timeout and track it for cleanup on unmount. */
  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
  }, []);

  function toggleCheck(type: LintIssue["type"]) {
    setEnabledChecks((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function selectAllChecks() {
    setEnabledChecks(new Set(ALL_CHECK_TYPES));
  }

  function clearAllChecks() {
    setEnabledChecks(new Set());
  }

  async function runLint() {
    setLoading(true);
    setError(null);
    setResult(null);
    setFixMessages(new Map());

    try {
      // Build request body with filter options
      const body: Record<string, unknown> = {};

      // Only send checks if not all are enabled
      const checks = Array.from(enabledChecks);
      if (checks.length > 0 && checks.length < ALL_CHECK_TYPES.length) {
        body.checks = checks;
      } else if (checks.length === 0) {
        // Nothing selected — still send empty array so server skips all checks
        body.checks = [];
      }

      // Map severity filter to minSeverity
      if (severityFilter === "warning") {
        body.minSeverity = "warning";
      } else if (severityFilter === "error") {
        body.minSeverity = "error";
      }

      const res = await fetch("/api/lint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          ? `${issue.type}:${issue.slug}:${targetSlug}`
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
          scheduleTimeout(() => {
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
        scheduleTimeout(() => {
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
        scheduleTimeout(() => {
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
    [scheduleTimeout],
  );

  /** Compute fix key for a given issue — mirrors logic in handleFix. */
  function fixKey(issue: LintIssue): string {
    const targetSlug = issue.target ?? null;
    if (
      (issue.type === "missing-crossref" ||
        issue.type === "contradiction" ||
        issue.type === "broken-link") &&
      targetSlug
    ) {
      return `${issue.type}:${issue.slug}:${targetSlug}`;
    }
    if (issue.type === "missing-concept-page") {
      return `missing-concept-page:${issue.message}`;
    }
    return `${issue.type}:${issue.slug}`;
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

      <LintFilterControls
        enabledChecks={enabledChecks}
        onToggleCheck={toggleCheck}
        onSelectAll={selectAllChecks}
        onClearAll={clearAllChecks}
        severityFilter={severityFilter}
        onSeverityChange={setSeverityFilter}
        onRunLint={runLint}
        loading={loading}
      />

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
                const key = fixKey(issue);
                return (
                  <LintIssueCard
                    key={`${issue.type}-${issue.slug}-${issue.target ?? ""}-${i}`}
                    issue={issue}
                    isFixing={fixingSet.has(key)}
                    fixMessage={fixMessages.get(key) ?? null}
                    onFix={handleFix}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
