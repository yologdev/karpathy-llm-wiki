"use client";

import { useCallback, useState } from "react";

import {
  DataviewFilterRow,
  makeFilter,
  type DataviewOp,
  type DataviewResultRow,
  type FilterRow,
} from "./DataviewFilterRow";
import { DataviewResultsTable } from "./DataviewResultsTable";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataviewPanel() {
  const [filters, setFilters] = useState<FilterRow[]>([makeFilter()]);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DataviewResultRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const addFilter = useCallback(() => {
    setFilters((prev) => [...prev, makeFilter()]);
  }, []);

  const removeFilter = useCallback((id: number) => {
    setFilters((prev) => {
      const next = prev.filter((f) => f.id !== id);
      return next.length === 0 ? [makeFilter()] : next;
    });
  }, []);

  const updateFilter = useCallback(
    (id: number, patch: Partial<Omit<FilterRow, "id">>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    // Build request body
    const activeFilters = filters
      .filter((f) => f.field.trim().length > 0)
      .map((f) => ({
        field: f.field.trim(),
        op: f.op as DataviewOp,
        ...(f.op !== "exists" ? { value: f.value } : {}),
      }));

    const body: Record<string, unknown> = {
      limit: Math.min(Math.max(1, limit), 200),
    };
    if (activeFilters.length > 0) {
      body.filters = activeFilters;
    }
    if (sortField.trim()) {
      body.sortBy = sortField.trim();
      body.sortOrder = sortOrder;
    }

    try {
      const res = await fetch("/api/wiki/dataview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [filters, sortField, sortOrder, limit]);

  return (
    <div className="rounded-lg border border-foreground/10 p-4 space-y-4">
      {/* ---- Filter rows ---- */}
      <div>
        <span className="text-sm font-medium text-foreground/70">Filters</span>
        <div className="mt-2 space-y-2">
          {filters.map((f) => (
            <DataviewFilterRow
              key={f.id}
              filter={f}
              onUpdate={updateFilter}
              onRemove={removeFilter}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addFilter}
          className="mt-2 text-xs text-foreground/50 hover:text-foreground/80 transition-colors underline underline-offset-2"
        >
          + Add filter
        </button>
      </div>

      {/* ---- Sort controls ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-foreground/70">Sort by</span>
        <input
          type="text"
          placeholder="field (e.g. created)"
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
          className="w-40 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
        />
        <button
          type="button"
          onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
          className="rounded-md border border-foreground/10 px-2 py-1 text-xs text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
        >
          {sortOrder === "asc" ? "▲ Asc" : "▼ Desc"}
        </button>
      </div>

      {/* ---- Limit ---- */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground/70">Limit</span>
        <input
          type="number"
          min={1}
          max={200}
          value={limit}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v)) setLimit(Math.min(Math.max(1, v), 200));
          }}
          className="w-20 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
        />
      </div>

      {/* ---- Run button ---- */}
      <button
        type="button"
        onClick={runQuery}
        disabled={loading}
        className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Running…" : "Run Query"}
      </button>

      {/* ---- Error display ---- */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ---- Results table ---- */}
      {results !== null && (
        <DataviewResultsTable results={results} total={total} />
      )}
    </div>
  );
}
