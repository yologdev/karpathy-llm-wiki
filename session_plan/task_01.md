Title: Update SCHEMA.md with yopedia fields and new lint checks
Files: SCHEMA.md
Issue: none

## Context

Session 60 added 7 new frontmatter fields (`confidence`, `expiry`, `authors`,
`contributors`, `disputed`, `supersedes`, `aliases`) and 2 new lint checks
(`stale-page`, `low-confidence`) but did NOT update SCHEMA.md. The schema's own
Co-evolution section says: "the schema should be updated in the same commit."
This is the most egregious co-evolution violation in the project's history — 
paying it down is a one-file, zero-risk task.

## What to do

1. **Page conventions section** — Add a new subsection documenting the yopedia
   frontmatter fields. For each field, document:
   - Name, type, default value
   - When it's populated (ingest, re-ingest, manual edit)
   - What consumes it (lint checks, UI, etc.)

   The fields to document:
   - `confidence` (number 0–1, default 0.5, set by LLM during ingest)
   - `expiry` (ISO date string, set by LLM during ingest)
   - `authors` (string array, set to ["yoyo"] on initial ingest)
   - `contributors` (string array, accumulated on re-ingest/edit)
   - `disputed` (boolean, default false)
   - `supersedes` (string slug of replaced page)
   - `aliases` (string array, alternative names)

2. **Page templates section** — Update the Source summary and Entity page YAML
   examples to include the new fields.

3. **Known gaps section** — Update to mention:
   - `stale-page` and `low-confidence` lint checks exist but have no auto-fix
   - `sources[]` structured array is planned but not yet implemented (still using flat `source_url`)
   - Wiki page view does not yet display yopedia metadata

4. **Lint section** — If there's a section describing lint checks, update it to
   list all 9 checks (was 7). If no dedicated section exists, add a brief list
   under Known gaps or create a new Lint checks section.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

(SCHEMA.md is a markdown file — build/lint/test should still pass; just verify
no accidental breakage.)
