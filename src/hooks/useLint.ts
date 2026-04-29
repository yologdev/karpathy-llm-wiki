"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { LintIssue } from "@/lib/types";
import {
  ALL_CHECK_TYPES,
  type SeverityFilter,
} from "@/components/LintFilterControls";

interface LintResponse {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
  error?: string;
}

export interface UseLintReturn {
  // State
  result: LintResponse | null;
  loading: boolean;
  error: string | null;
  fixingSet: Set<string>;
  fixMessages: Map<string, string>;
  enabledChecks: Set<LintIssue["type"]>;
  severityFilter: SeverityFilter;
  // Actions
  toggleCheck: (type: LintIssue["type"]) => void;
  selectAllChecks: () => void;
  clearAllChecks: () => void;
  runLint: () => void;
  handleFix: (issue: LintIssue, targetSlug?: string) => void;
  setSeverityFilter: (f: SeverityFilter) => void;
  // Helpers
  fixKey: (issue: LintIssue) => string;
}

/** Compute fix key for a given issue — issue-type-specific tracking key. */
export function fixKey(issue: LintIssue): string {
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

export function useLint(): UseLintReturn {
  const [result, setResult] = useState<LintResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingSet, setFixingSet] = useState<Set<string>>(new Set());
  const [fixMessages, setFixMessages] = useState<Map<string, string>>(
    new Map(),
  );
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
        (issue.type === "missing-crossref" ||
          issue.type === "contradiction" ||
          issue.type === "broken-link") &&
        targetSlug
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

  return {
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
  };
}
