"use client";

import { formatRelativeTime } from "@/lib/format";

export interface Revision {
  timestamp: number;
  date: string;
  slug: string;
  sizeBytes: number;
  author?: string;
}

export interface RevisionItemProps {
  revision: Revision;
  isViewing: boolean;
  viewContent: string | null;
  viewLoading: boolean;
  reverting: boolean;
  onView: (timestamp: number) => void;
  onRevert: (timestamp: number) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

export function RevisionItem({
  revision: rev,
  isViewing,
  viewContent,
  viewLoading,
  reverting,
  onView,
  onRevert,
}: RevisionItemProps) {
  return (
    <li>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-foreground/70">
          {rev.author ? `by ${rev.author} · ` : ""}{formatRelativeTime(rev.date)}
        </span>
        <span className="text-xs text-foreground/40">
          {formatBytes(rev.sizeBytes)}
        </span>
        <span className="text-xs text-foreground/30">
          {new Date(rev.timestamp).toLocaleString()}
        </span>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => onView(rev.timestamp)}
            disabled={viewLoading && isViewing}
            aria-label={`View revision from ${new Date(rev.timestamp).toLocaleString()}`}
            className="rounded border border-foreground/20 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50 transition-colors"
          >
            {isViewing && viewContent !== null
              ? "Hide"
              : viewLoading && isViewing
                ? "Loading…"
                : "View"}
          </button>
          <button
            type="button"
            onClick={() => onRevert(rev.timestamp)}
            disabled={reverting}
            aria-label={`Restore revision from ${new Date(rev.timestamp).toLocaleString()}`}
            className="rounded border border-amber-500/30 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/20 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30 transition-colors"
          >
            {reverting ? "Reverting…" : "Revert"}
          </button>
        </div>
      </div>

      {/* Inline content viewer */}
      {isViewing && viewContent !== null && (
        <div className="mt-2 max-h-96 overflow-auto rounded border border-foreground/10 bg-foreground/[0.02] p-4">
          <pre className="whitespace-pre-wrap text-xs text-foreground/80 font-mono">
            {viewContent}
          </pre>
        </div>
      )}
    </li>
  );
}
