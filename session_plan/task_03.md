Title: Loading skeletons for remaining pages
Files: src/app/query/loading.tsx, src/app/settings/loading.tsx, src/app/wiki/loading.tsx, src/app/wiki/log/loading.tsx, src/app/wiki/graph/loading.tsx
Issue: none

## Description

10 pages lack `loading.tsx` files. Add loading skeletons for 5 of the most user-facing pages in this task. Each skeleton should match the page's layout structure with animated pulse placeholders.

### Pages to add (batch 1 — 5 highest traffic pages)

1. **`src/app/query/loading.tsx`** — Query page skeleton:
   - Title placeholder ("Query" heading)
   - Search input placeholder
   - History sidebar placeholder (narrow column on left)
   - Text: "Loading query…"

2. **`src/app/settings/loading.tsx`** — Settings page skeleton:
   - Title placeholder ("Settings" heading)
   - Provider form placeholders (label + input × 3)
   - Save button placeholder
   - Text: "Loading settings…"

3. **`src/app/wiki/loading.tsx`** — Wiki index skeleton:
   - Title placeholder ("Wiki" heading)
   - Toolbar placeholder (search bar + sort dropdown)
   - 3-4 page card placeholders (title line + summary line each)
   - Text: "Loading wiki…"

4. **`src/app/wiki/log/loading.tsx`** — Activity log skeleton:
   - Title placeholder ("Activity Log" heading)
   - Back link placeholder
   - Several text line placeholders
   - Text: "Loading log…"

5. **`src/app/wiki/graph/loading.tsx`** — Graph page skeleton:
   - Title placeholder ("Wiki Graph" heading)
   - Large rectangular canvas placeholder
   - Text: "Loading graph…"

### Implementation notes

- Follow the existing patterns from `src/app/loading.tsx`, `src/app/ingest/loading.tsx`, and `src/app/lint/loading.tsx`
- Use `animate-pulse` on `bg-foreground/10` divs sized to match the actual page elements
- Each file should be a simple default export function component
- Max ~30 lines each
- Verify: `pnpm build && pnpm lint && pnpm test`

### NOT included (defer to next session)

The remaining 5 pages (`raw/[slug]`, `wiki/[slug]`, `wiki/[slug]/edit`, `wiki/new`, `raw`) are lower traffic or have dynamic slug-based layouts that are less amenable to static skeletons.
