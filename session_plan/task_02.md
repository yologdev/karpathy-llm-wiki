Title: Decompose GlobalSearch into hook + sub-components
Files: src/hooks/useGlobalSearch.ts, src/components/SearchResultItem.tsx, src/components/GlobalSearch.tsx
Issue: none

## Description

`GlobalSearch.tsx` is 356 lines — the largest component after the recent WikiIndexClient decomposition. It contains three concerns interleaved:

1. **Data fetching & filtering logic** — page list fetch with cache, debounced content search, title/content result merging, deduplication
2. **Keyboard navigation & focus management** — Cmd+K / "/" shortcuts, arrow key navigation, Escape handling, click-outside-to-close
3. **Rendering** — search input, dropdown list items with snippets/fuzzy badges, mobile expand/collapse, "no results" state

This task extracts concerns #1 and #2 into a custom hook `useGlobalSearch`, and extracts the dropdown list item into `SearchResultItem`.

### What to build

1. **`src/hooks/useGlobalSearch.ts`** — Custom hook that encapsulates:
   - State: `query`, `open`, `expanded`, `highlighted`, `pages`, `contentResults`
   - Refs: `inputRef`, `containerRef`, `debounceRef`, `lastFetchRef`
   - Logic: `fetchPages()` with cache, `searchContent()` with debounce, title filtering, content dedup, result merging
   - Keyboard handler factory: returns `handleKeyDown` for the input and registers global Cmd+K / "/" listeners
   - Click-outside handler registration
   - Returns: `{ query, setQuery, open, expanded, results, highlighted, showDropdown, inputRef, containerRef, handleKeyDown, navigate, expand, collapse }`
   - The `navigate` callback takes a slug, resets state, and calls `router.push`

2. **`src/components/SearchResultItem.tsx`** — Small presentational component (~30-40 lines) for a single search result row:
   - Props: `{ id, label, snippet?, fuzzy?, highlighted, onMouseEnter, onMouseDown }`
   - Renders the `<li>` with label, fuzzy badge, snippet — extracted from the current inline JSX in GlobalSearch
   - Includes proper ARIA attributes (`role="option"`, `aria-selected`)

3. **Update `src/components/GlobalSearch.tsx`** — Reduce to ~120-150 lines of pure rendering:
   - Import and call `useGlobalSearch()`
   - Import `SearchResultItem`
   - Keep the JSX structure (search icon SVG, mobile toggle, input, dropdown, no-results message)
   - All logic is now in the hook; all list items delegate to SearchResultItem

### Key constraints

- **Behavior must be identical** — no changes to keyboard shortcuts, focus management, aria attributes, or styling
- **The hook must not import React components** — it only manages state and returns primitives/callbacks
- **SearchResultItem should accept all styling as props or use the same Tailwind classes**

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Build must pass. Existing tests must remain green. The combined line count of the three files should be roughly equal to the original (no bloat), but GlobalSearch.tsx should drop to ~120-150 lines.
