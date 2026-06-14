"use client";

import { useState } from "react";

interface ReingestButtonProps {
  slug: string;
}

/**
 * Re-ingest a page directly: re-fetch the page's source, re-synthesize, and
 * write it in place over `/api/ingest/reingest`. There is no preview/review
 * step — the re-ingest runs synchronously and the page reloads on success.
 */
export function ReingestButton({ slug }: ReingestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reingest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Re-ingest failed");
        setLoading(false);
        return;
      }
      // Reload so the reader sees the updated page.
      window.location.reload();
    } catch {
      setError("Network error — could not reach the server");
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={reingest}
        disabled={loading}
        aria-label="Re-ingest source content"
        className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Re-ingesting…" : "Re-ingest"}
      </button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
