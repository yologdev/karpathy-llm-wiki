"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";
import { parseISODate } from "@/lib/format";
import { DataviewPanel } from "@/components/DataviewPanel";
import { WikiIndexToolbar } from "@/components/WikiIndexToolbar";
import { WikiPageCard } from "@/components/WikiPageCard";

export type SortOption = "recent" | "title-asc" | "title-desc" | "most-sources";

const PAGE_SIZE = 20;

interface WikiIndexClientProps {
  pages: IndexEntry[];
}

export function WikiIndexClient({ pages }: WikiIndexClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDataview, setShowDataview] = useState(false);
  const [page, setPage] = useState(1);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/wiki/export");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(body.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "llm-wiki-vault.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  // Union of all tags across all pages, de-duped and sorted alphabetically.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const page of pages) {
      for (const tag of page.tags ?? []) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [pages]);

  // Filter by search term, active tags, and date range — then sort.
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const fromDate = dateFrom || null;
    const toDate = dateTo || null;

    const result = pages.filter((page) => {
      // Text search
      if (q.length > 0) {
        const hay = `${page.title} ${page.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Tag filter (AND semantics)
      if (activeTags.length > 0) {
        const pageTags = page.tags ?? [];
        for (const tag of activeTags) {
          if (!pageTags.includes(tag)) return false;
        }
      }
      // Date range filter
      if (fromDate || toDate) {
        const pageDate = parseISODate(page.updated);
        if (!pageDate) return false; // no date → exclude when date filter is active
        if (fromDate && pageDate < fromDate) return false;
        if (toDate && pageDate > toDate) return false;
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "recent": {
          const da = a.updated ?? "";
          const db = b.updated ?? "";
          // nulls last: pages without dates go to the end
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return db.localeCompare(da);
        }
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "most-sources":
          return (b.sourceCount ?? 0) - (a.sourceCount ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [pages, searchTerm, activeTags, sortBy, dateFrom, dateTo]);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, activeTags, sortBy, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedPages = filtered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const hasActiveFilters =
    searchTerm.length > 0 ||
    activeTags.length > 0 ||
    sortBy !== "recent" ||
    dateFrom.length > 0 ||
    dateTo.length > 0;

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setActiveTags([]);
    setSortBy("recent");
    setDateFrom("");
    setDateTo("");
  };

  if (pages.length === 0) {
    return (
      <p className="text-foreground/60">
        No wiki pages yet.{" "}
        <Link href="/ingest" className="underline hover:text-foreground">
          Ingest some content
        </Link>{" "}
        or{" "}
        <Link href="/wiki/new" className="underline hover:text-foreground">
          create a page
        </Link>{" "}
        to get started!
      </p>
    );
  }

  return (
    <div>
      <WikiIndexToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        sortBy={sortBy}
        onSortChange={setSortBy}
        allTags={allTags}
        activeTags={activeTags}
        onToggleTag={toggleTag}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        showAdvanced={showAdvanced}
        onToggleAdvanced={() => setShowAdvanced((v) => !v)}
        showDataview={showDataview}
        onToggleDataview={() => setShowDataview((v) => !v)}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        exporting={exporting}
        onExport={handleExport}
        filteredCount={filtered.length}
        totalCount={pages.length}
      />

      {/* Dataview query panel — collapsible */}
      {showDataview && (
        <div className="mb-4">
          <DataviewPanel />
        </div>
      )}

      {/* Filtered list */}
      {filtered.length === 0 ? (
        <p className="text-foreground/60">No pages match your filters.</p>
      ) : (
        <ul className="space-y-3">
          {paginatedPages.map((page) => (
            <WikiPageCard key={page.slug} page={page} />
          ))}
        </ul>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-foreground/20 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-foreground/5 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-foreground/60">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-foreground/20 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-foreground/5 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
