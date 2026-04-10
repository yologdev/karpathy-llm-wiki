Title: Fix SCHEMA.md lint check descriptions to match actual code
Files: SCHEMA.md
Issue: none

## Problem

SCHEMA.md is loaded into LLM prompts at runtime (in `lint.ts` contradiction detection and in `ingest.ts` page generation). The lint check descriptions in SCHEMA.md are aspirational, not actual:

- SCHEMA says "orphan" = page has no inbound links from any other page
  - Code's `orphan-page` actually = page file on disk but not listed in `index.md`
- SCHEMA says "stale" = page not updated in a long time
  - Code's `stale-index` actually = entry in `index.md` but no `.md` file on disk (a dangling reference)

This means the LLM gets incorrect context about what lint checks exist, which could degrade contradiction detection quality (the LLM sees irrelevant lint descriptions in its system prompt).

## Fix

Update the lint checks section of SCHEMA.md to accurately describe the five checks as implemented:

1. **`orphan-page`** (warning) — Wiki page file exists on disk but is not listed in `index.md`. Auto-fix: add to index.
2. **`stale-index`** (error) — Entry exists in `index.md` but no corresponding `.md` file on disk. Auto-fix: remove from index.
3. **`empty-page`** (warning) — Page has fewer than 50 characters of content after stripping the H1 heading. Auto-fix: regenerate via LLM.
4. **`missing-crossref`** (info) — Page mentions another page's title (3+ chars, word boundary) without linking to it. Auto-fix: LLM rewrites page to add links.
5. **`contradiction`** (warning) — LLM detects conflicting claims between pages in a cross-reference cluster (max 5 pages per cluster). No auto-fix yet.

Also review the rest of SCHEMA.md for any other description ↔ code mismatches. Fix only what's clearly wrong — don't add speculative content.

## Key constraint

- Do NOT modify llm-wiki.md (founding vision, immutable)
- Keep SCHEMA.md concise and factual
- Preserve the existing structure/sections of the file

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

This is a documentation-only change, so build/test should be unaffected. Verify no file was accidentally broken.
