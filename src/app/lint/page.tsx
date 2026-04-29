"use client";

import Link from "next/link";
import { LintFilterControls } from "@/components/LintFilterControls";
import { LintIssueCard } from "@/components/LintIssueCard";
import { useLint } from "@/hooks/useLint";

export default function LintPage() {
  const {
    result,
    loading,
    error,
    fixingSet,
    fixMessages,
    enabledChecks,
    severityFilter,
    toggleCheck,
    selectAllChecks,
    clearAllChecks,
    runLint,
    handleFix,
    setSeverityFilter,
    fixKey,
  } = useLint();

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

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Wiki Health Check</h1>
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
