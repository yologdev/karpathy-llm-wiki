"use client";

import { formatRelativeTime } from "@/lib/format";

export interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  timestamp: string;
  savedAs?: string;
}

interface Props {
  history: HistoryEntry[];
  loading: boolean;
  currentId: string | null;
  onSelect: (entry: HistoryEntry) => void;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

export function QueryHistorySidebar({ history, loading, currentId, onSelect }: Props) {
  return (
    <aside className="lg:w-72 shrink-0">
      <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-3">
        Recent Queries
      </h2>
      {loading ? (
        <p className="text-xs text-foreground/40">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-foreground/40">
          No queries yet. Ask something!
        </p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id}>
              <button
                onClick={() => onSelect(entry)}
                className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-foreground/5 ${
                  currentId === entry.id
                    ? "border-foreground/40 bg-foreground/5"
                    : "border-foreground/10"
                }`}
              >
                <span className="block truncate font-medium">
                  {truncate(entry.question, 80)}
                </span>
                <span className="flex items-center gap-2 mt-1 text-xs text-foreground/50">
                  <span>{formatRelativeTime(entry.timestamp)}</span>
                  {entry.sources.length > 0 && (
                    <span>
                      {entry.sources.length} source
                      {entry.sources.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {entry.savedAs && (
                    <span className="text-green-600 dark:text-green-400">
                      saved
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
