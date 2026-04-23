"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchNode {
  id: string;
  label: string;
  /** If present, this is a content match with a snippet */
  snippet?: string;
  /** True when this result came from fuzzy matching */
  fuzzy?: boolean;
}

const MAX_RESULTS = 8;
const CONTENT_SEARCH_DEBOUNCE_MS = 300;
const CONTENT_SEARCH_MIN_CHARS = 3;

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<SearchNode[]>([]);
  const [contentResults, setContentResults] = useState<SearchNode[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);

  const PAGES_CACHE_MS = 5000;

  // Fetch page list for title matching — cached with staleness guard
  const fetchPages = useCallback(async () => {
    const now = Date.now();
    if (pages.length > 0 && now - lastFetchRef.current < PAGES_CACHE_MS) {
      return;
    }
    try {
      const res = await fetch("/api/wiki");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.pages)) {
        setPages(
          data.pages.map((p: { slug: string; title: string }) => ({
            id: p.slug,
            label: p.title,
          })),
        );
        lastFetchRef.current = Date.now();
      }
    } catch {
      // silently fail — search just won't have results
    }
  }, [pages.length]);

  // Debounced content search
  const searchContent = useCallback((q: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (q.trim().length < CONTENT_SEARCH_MIN_CHARS) {
      setContentResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/wiki/search?q=${encodeURIComponent(q.trim())}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.results)) {
          setContentResults(
            data.results.map(
              (r: { slug: string; title: string; snippet: string; fuzzy?: boolean }) => ({
                id: r.slug,
                label: r.title,
                snippet: r.snippet,
                fuzzy: r.fuzzy,
              }),
            ),
          );
        }
      } catch {
        // silently fail
      }
    }, CONTENT_SEARCH_DEBOUNCE_MS);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Keyboard shortcuts: "/" and Cmd/Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if user is already in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const isContentEditable = (e.target as HTMLElement)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setExpanded(true);
        fetchPages();
        return;
      }

      if (e.key === "/" && !isEditable && !isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
        setExpanded(true);
        fetchPages();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [fetchPages]);

  // Click outside to close
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setExpanded(false);
        setQuery("");
        setContentResults([]);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // Filter results: title matches first, then content matches (deduplicated)
  const lowerQuery = query.toLowerCase().trim();
  const titleMatches =
    lowerQuery.length > 0
      ? pages
          .filter((p) => p.label.toLowerCase().includes(lowerQuery))
          .slice(0, MAX_RESULTS)
      : [];

  // Deduplicate content results against title matches
  const titleMatchSlugs = new Set(titleMatches.map((p) => p.id));
  const dedupedContentResults = contentResults.filter(
    (r) => !titleMatchSlugs.has(r.id),
  );

  // Merge: title matches first, then content matches
  const results = [
    ...titleMatches,
    ...dedupedContentResults.slice(0, MAX_RESULTS - titleMatches.length),
  ];

  const showDropdown = open && lowerQuery.length > 0 && results.length > 0;

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlighted(0);
  }, [lowerQuery]);

  function navigate(slug: string) {
    setQuery("");
    setOpen(false);
    setExpanded(false);
    setContentResults([]);
    router.push(`/wiki/${slug}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      setExpanded(false);
      setContentResults([]);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      navigate(results[highlighted]?.id ?? results[0].id);
    }
  }

  // Search icon button (mobile collapsed state)
  const searchIcon = (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Mobile: icon button to expand */}
      {!expanded && (
        <button
          type="button"
          className="sm:hidden text-foreground/50 hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-foreground/5"
          onClick={() => {
            setExpanded(true);
            fetchPages();
            // Focus after render
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          aria-label="Search wiki"
        >
          {searchIcon}
        </button>
      )}

      {/* Desktop: always visible input. Mobile: visible only when expanded */}
      <div
        className={`${expanded ? "flex" : "hidden"} sm:flex items-center gap-1.5`}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-foreground/40">
            {searchIcon}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              searchContent(e.target.value);
            }}
            onFocus={() => {
              setOpen(true);
              fetchPages();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search… ( / )"
            className="w-40 lg:w-56 rounded-md border border-foreground/10 bg-foreground/5 py-1 pl-7 pr-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors"
            aria-label="Search wiki pages"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            role="combobox"
            aria-controls={showDropdown ? "global-search-results" : undefined}
            aria-activedescendant={
              showDropdown ? `search-result-${highlighted}` : undefined
            }
          />

          {/* Dropdown results */}
          {showDropdown && (
            <ul
              id="global-search-results"
              role="listbox"
              className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-md border border-foreground/10 bg-background shadow-lg z-[60]"
            >
              {results.map((page, i) => (
                <li
                  key={page.id}
                  id={`search-result-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                    i === highlighted
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur before navigate
                    navigate(page.id);
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{page.label}</span>
                    {page.fuzzy && (
                      <span className="text-[10px] text-foreground/30 italic whitespace-nowrap">
                        (fuzzy match)
                      </span>
                    )}
                  </div>
                  {page.snippet && (
                    <div className="text-xs text-foreground/40 mt-0.5 truncate">
                      {page.snippet}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* No results message */}
          {open && lowerQuery.length > 0 && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-foreground/10 bg-background shadow-lg z-[60] px-3 py-2 text-sm text-foreground/50">
              No pages found
            </div>
          )}
        </div>

        {/* Close button on mobile */}
        {expanded && (
          <button
            type="button"
            className="sm:hidden text-foreground/50 hover:text-foreground transition-colors p-1"
            onClick={() => {
              setExpanded(false);
              setQuery("");
              setOpen(false);
              setContentResults([]);
            }}
            aria-label="Close search"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
