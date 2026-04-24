"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirror the API types without importing server-side modules)
// ---------------------------------------------------------------------------

type DataviewOp =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "exists";

interface FilterRow {
  id: number;
  field: string;
  op: DataviewOp;
  value: string;
}

interface DataviewResultRow {
  slug: string;
  title: string;
  frontmatter: Record<string, string | string[]>;
}

const OP_LABELS: Record<DataviewOp, string> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "contains",
  exists: "exists",
};

const ALL_OPS: DataviewOp[] = [
  "eq",
  "neq",
  "gt",
  "lt",
  "gte",
  "lte",
  "contains",
  "exists",
];

let nextId = 1;

function makeFilter(): FilterRow {
  return { id: nextId++, field: "", op: "eq", value: "" };
}

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
        op: f.op,
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

  // Collect the unique frontmatter keys from the result set for table headers
  const fmKeys =
    results && results.length > 0
      ? Array.from(
          results.reduce<Set<string>>((set, r) => {
            for (const k of Object.keys(r.frontmatter)) set.add(k);
            return set;
          }, new Set()),
        ).sort()
      : [];

  return (
    <div className="rounded-lg border border-foreground/10 p-4 space-y-4">
      {/* ---- Filter rows ---- */}
      <div>
        <span className="text-sm font-medium text-foreground/70">Filters</span>
        <div className="mt-2 space-y-2">
          {filters.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="field (e.g. tags)"
                value={f.field}
                onChange={(e) =>
                  updateFilter(f.id, { field: e.target.value })
                }
                className="w-36 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
              />
              <select
                value={f.op}
                onChange={(e) =>
                  updateFilter(f.id, { op: e.target.value as DataviewOp })
                }
                className="rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
              >
                {ALL_OPS.map((op) => (
                  <option key={op} value={op}>
                    {OP_LABELS[op]}
                  </option>
                ))}
              </select>
              {f.op !== "exists" && (
                <input
                  type="text"
                  placeholder="value"
                  value={f.value}
                  onChange={(e) =>
                    updateFilter(f.id, { value: e.target.value })
                  }
                  className="w-40 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
                />
              )}
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                className="rounded-md px-1.5 py-0.5 text-sm text-foreground/40 hover:text-foreground/80 transition-colors"
                aria-label="Remove filter"
              >
                ×
              </button>
            </div>
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
        <div>
          <p className="mb-2 text-xs text-foreground/50">
            {total} {total === 1 ? "result" : "results"}
          </p>
          {results.length === 0 ? (
            <p className="text-sm text-foreground/60">
              No pages matched the query.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-foreground/10 text-left text-xs text-foreground/50">
                    <th className="py-1.5 pr-3 font-medium">Slug</th>
                    <th className="py-1.5 pr-3 font-medium">Title</th>
                    {fmKeys.map((k) => (
                      <th key={k} className="py-1.5 pr-3 font-medium">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr
                      key={row.slug}
                      className="border-b border-foreground/5 last:border-0"
                    >
                      <td className="py-1.5 pr-3">
                        <Link
                          href={`/wiki/${row.slug}`}
                          className="text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                        >
                          {row.slug}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3">{row.title}</td>
                      {fmKeys.map((k) => {
                        const val = row.frontmatter[k];
                        const display =
                          val === undefined
                            ? ""
                            : Array.isArray(val)
                              ? val.join(", ")
                              : val;
                        return (
                          <td
                            key={k}
                            className="py-1.5 pr-3 text-foreground/70"
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
