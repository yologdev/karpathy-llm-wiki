"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

interface WikiIndexClientProps {
  pages: IndexEntry[];
}

export function WikiIndexClient({ pages }: WikiIndexClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

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

  // Filter by search term (title + summary) and active tags (AND semantics).
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return pages.filter((page) => {
      if (q.length > 0) {
        const hay = `${page.title} ${page.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeTags.length > 0) {
        const pageTags = page.tags ?? [];
        for (const tag of activeTags) {
          if (!pageTags.includes(tag)) return false;
        }
      }
      return true;
    });
  }, [pages, searchTerm, activeTags]);

  const hasActiveFilters = searchTerm.length > 0 || activeTags.length > 0;

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setActiveTags([]);
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
      {/* Search input + Export button */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search pages…"
          aria-label="Search wiki pages"
          className="flex-1 rounded-lg border border-foreground/10 bg-transparent px-4 py-2 text-sm outline-none focus:border-foreground/30 transition-colors"
        />
        <Link
          href="/wiki/new"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          + New page
        </Link>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-2 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Download wiki as Obsidian vault (.zip)"
        >
          {exporting ? "Exporting…" : "↓ Export"}
        </button>
      </div>

      {/* Tag filter row */}
      {allTags.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
            {allTags.map((tag) => {
              const isActive = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={
                    isActive
                      ? "shrink-0 rounded-full bg-foreground px-2.5 py-0.5 text-xs text-background transition-colors"
                      : "shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-md border border-foreground/10 px-2.5 py-1 text-xs text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Results count when filtering */}
      {hasActiveFilters && (
        <p className="mb-3 text-xs text-foreground/50">
          {filtered.length} of {pages.length} pages
        </p>
      )}

      {/* Filtered list */}
      {filtered.length === 0 ? (
        <p className="text-foreground/60">No pages match your filters.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((page) => {
            const relLabel = page.updated ? formatRelativeTime(page.updated) : null;
            const pageTags = page.tags ?? [];
            const hasMeta =
              pageTags.length > 0 ||
              relLabel !== null ||
              (page.sourceCount ?? 0) > 0;

            return (
              <li key={page.slug}>
                <Link
                  href={`/wiki/${page.slug}`}
                  className="group block rounded-lg border border-foreground/10 p-4 hover:border-foreground/30 transition-colors"
                >
                  <span className="font-medium group-hover:underline">
                    {page.title}
                  </span>
                  <span className="mt-1 block text-sm text-foreground/60">
                    {page.summary}
                  </span>
                  {hasMeta && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-foreground/50">
                      {pageTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {tag}
                        </span>
                      ))}
                      {relLabel && <span>updated {relLabel}</span>}
                      {(page.sourceCount ?? 0) > 0 && (
                        <span>
                          {page.sourceCount}{" "}
                          {page.sourceCount === 1 ? "source" : "sources"}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
