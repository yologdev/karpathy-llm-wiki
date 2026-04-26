import Link from "next/link";
import type { SortOption } from "@/components/WikiIndexClient";

interface WikiIndexToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  allTags: string[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  showDataview: boolean;
  onToggleDataview: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  exporting: boolean;
  onExport: () => void;
  filteredCount: number;
  totalCount: number;
}

export function WikiIndexToolbar({
  searchTerm,
  onSearchChange,
  sortBy,
  onSortChange,
  allTags,
  activeTags,
  onToggleTag,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  showAdvanced,
  onToggleAdvanced,
  showDataview,
  onToggleDataview,
  hasActiveFilters,
  onClearFilters,
  exporting,
  onExport,
  filteredCount,
  totalCount,
}: WikiIndexToolbarProps) {
  return (
    <>
      {/* Search input + Sort dropdown + Export button */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search pages…"
          aria-label="Search wiki pages"
          className="w-full sm:w-auto sm:flex-1 rounded-lg border border-foreground/10 bg-transparent px-4 py-2 text-sm outline-none focus:border-foreground/30 transition-colors"
        />
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            aria-label="Sort pages"
            className="shrink-0 rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30 transition-colors"
          >
            <option value="recent">Recently updated</option>
            <option value="title-asc">Title A–Z</option>
            <option value="title-desc">Title Z–A</option>
            <option value="most-sources">Most sources</option>
          </select>
          <Link
            href="/wiki/new"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            + New page
          </Link>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-2 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Download wiki as Obsidian vault (.zip)"
          >
            {exporting ? "Exporting…" : "↓ Export"}
          </button>
          <button
            type="button"
            onClick={onToggleDataview}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
              showDataview
                ? "border-foreground/30 text-foreground"
                : "border-foreground/10 text-foreground/70 hover:border-foreground/30 hover:text-foreground"
            }`}
            title="Query pages by frontmatter fields"
          >
            📊 Dataview
          </button>
        </div>
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
                  onClick={() => onToggleTag(tag)}
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
              onClick={onClearFilters}
              className="shrink-0 rounded-md border border-foreground/10 px-2.5 py-1 text-xs text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Advanced filters (date range) — collapsible */}
      <div className="mb-4">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="text-xs text-foreground/50 hover:text-foreground/80 transition-colors"
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? "▾ Advanced filters" : "▸ Advanced filters"}
        </button>
        {showAdvanced && (
          <div className="mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-1.5 text-xs text-foreground/60">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-foreground/60">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
              />
            </label>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  onDateFromChange("");
                  onDateToChange("");
                }}
                className="text-xs text-foreground/50 hover:text-foreground/80 transition-colors"
              >
                Clear dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Clear filters button when no tags row but filters are active */}
      {allTags.length === 0 && hasActiveFilters && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-md border border-foreground/10 px-2.5 py-1 text-xs text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Results count when filtering */}
      {hasActiveFilters && (
        <p className="mb-3 text-xs text-foreground/50">
          {filteredCount} of {totalCount} pages
        </p>
      )}
    </>
  );
}
