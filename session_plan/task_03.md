Title: Fix tsc error and add wiki page type templates to SCHEMA.md
Files: tsconfig.json, SCHEMA.md, src/lib/schema.ts
Issue: none

## Description

Two small improvements bundled together since each is under 10 minutes.

### Part A: Fix the tsc --noEmit error

`src/lib/__tests__/fetch.test.ts:894` uses a regex with the `s` (dotAll) flag, which requires ES2018. The tsconfig target is currently `ES2017`.

**Fix**: Bump `compilerOptions.target` in `tsconfig.json` from `"ES2017"` to `"ES2018"`. This is safe because:
- Next.js handles its own transpilation target independently
- The `lib` field already includes `"esnext"`
- ES2018 is universally supported in Node 18+

Verify with `npx tsc --noEmit` after the change.

### Part B: Add page type templates to SCHEMA.md

The founding vision (llm-wiki.md) describes different page types: "summaries, entity pages, concept pages, comparisons, an overview, a synthesis." Currently SCHEMA.md has a generic "Page conventions" section but doesn't differentiate page types or provide templates.

Add a new `## Page templates` section to SCHEMA.md (after `## Page conventions`) that defines templates for the common page types the wiki produces:

1. **Source summary** — created by ingest. Template: H1 title, summary paragraph, `## Key Points` (bullets), `## Details` (prose), `## Sources` (list of raw source links), YAML frontmatter with `type: summary`, `source_url`, `tags`.

2. **Entity page** — about a specific person, organization, tool. Template: H1 title, summary paragraph, `## Overview`, `## Key Facts` (structured data), `## Connections` (links to related entities), YAML frontmatter with `type: entity`, `tags`.

3. **Concept page** — about an idea, pattern, or technique. Template: H1 title, summary paragraph, `## Definition`, `## Examples`, `## Related Concepts`, YAML frontmatter with `type: concept`, `tags`.

4. **Comparison page** — created by saving a query answer that compares things. Template: H1 title, summary paragraph, comparison table, `## Analysis`, `## Sources`, YAML frontmatter with `type: comparison`, `tags`.

Also update `src/lib/schema.ts` to expose a `loadPageTemplates()` function that extracts the `## Page templates` section, analogous to the existing `loadPageConventions()`. This allows future prompt integration (ingest/query prompts can load templates at runtime).

### Verification

```sh
npx tsc --noEmit  # Should now pass cleanly
pnpm build && pnpm lint && pnpm test
```
