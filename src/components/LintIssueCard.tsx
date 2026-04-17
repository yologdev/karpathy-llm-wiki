import Link from "next/link";
import type { LintIssue } from "@/lib/types";

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

const fixableTypes = new Set([
  "missing-crossref",
  "orphan-page",
  "stale-index",
  "empty-page",
  "contradiction",
  "missing-concept-page",
  "broken-link",
]);

const fixLabel: Record<string, string> = {
  "missing-crossref": "Fix",
  "orphan-page": "Add to index",
  "stale-index": "Remove from index",
  "empty-page": "Delete page",
  "contradiction": "Resolve",
  "missing-concept-page": "Create page",
  "broken-link": "Remove link",
};

export interface LintIssueCardProps {
  issue: LintIssue;
  isFixing: boolean;
  fixMessage: string | null;
  onFix: (issue: LintIssue, targetSlug?: string) => void;
}

export function LintIssueCard({
  issue,
  isFixing,
  fixMessage,
  onFix,
}: LintIssueCardProps) {
  const styles = severityClasses[issue.severity];
  const targetSlug = issue.target ?? null;

  const isFixable =
    fixableTypes.has(issue.type) &&
    (issue.type !== "missing-crossref" || targetSlug !== null) &&
    (issue.type !== "contradiction" || targetSlug !== null) &&
    (issue.type !== "missing-concept-page" ||
      issue.message.startsWith('Concept "')) &&
    (issue.type !== "broken-link" || targetSlug !== null);

  return (
    <li
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
          onClick={() => onFix(issue, targetSlug ?? undefined)}
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
      {fixMessage && (
        <span
          className={`ml-2 text-xs ${
            fixMessage.startsWith("Fix failed")
              ? "text-red-600 dark:text-red-400"
              : "text-green-600 dark:text-green-400"
          }`}
        >
          {fixMessage}
        </span>
      )}
      <span className="basis-full text-sm text-foreground/80 mt-1">
        {issue.message}
      </span>
    </li>
  );
}
