Title: sources[] UI display — provenance badges in wiki page view
Files: src/app/wiki/[slug]/page.tsx, SCHEMA.md
Issue: none

Display the structured `sources[]` provenance data in the wiki page view,
replacing (or supplementing) the flat `source_url` display.

**What to build:**

1. **Source provenance section** in wiki page view (`src/app/wiki/[slug]/page.tsx`):
   - Parse the `sources` frontmatter field using `parseSources()` from task_02
   - Display each source entry as a row: type badge (URL/text/x-mention),
     clickable URL (or "text paste" label), fetch date, triggered-by attribution
   - Falls back to showing flat `source_url` if no structured `sources` exist
     (backward compat for old pages)
   - Type badges use the same design language as existing metadata badges
     (confidence, expiry, etc.)

2. **SCHEMA.md update:**
   - Document the `sources` field in the yopedia frontmatter table
   - Update the "Known gaps" section to remove the `sources[]` gap note
   - Update page templates to include `sources` field

**What NOT to do:**
- Don't build the full SourceBadge component (that name is already taken for
  settings source display) — inline the display in the page view
- Don't add source display to index cards or other views (scope creep)

**Verification:** `pnpm build && pnpm lint && pnpm test`
