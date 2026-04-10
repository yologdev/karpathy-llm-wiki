Title: Update SCHEMA.md and add empty-state onboarding to home page
Files: SCHEMA.md, src/app/page.tsx, src/lib/wiki.ts (read-only, just importing listWikiPages)
Issue: none

Two small improvements that address assessment concerns #3 (stale SCHEMA.md) and #7
(no onboarding for first-time users).

### Part A: Fix SCHEMA.md known gaps

The "Known gaps" section says lint auto-fix only handles `missing-crossref`, but the
2026-04-10 12:55 session expanded it to also handle `orphan-page`, `stale-index`, and
`empty-page`. Update the bullet to reflect reality:

Replace the bullet:
> Lint auto-fix is partially implemented — only `missing-crossref` issues can
> be auto-fixed via `POST /api/lint/fix`. Other fixable issue types (orphans,
> empty pages) are not yet supported.

With:
> Lint auto-fix handles `missing-crossref`, `orphan-page`, `stale-index`, and
> `empty-page` issues via `POST /api/lint/fix`. Contradiction auto-fix (which
> would require LLM rewriting) is not yet supported.

### Part B: Empty-state onboarding on home page

Currently a first-time user lands on the home page and sees the 4 feature cards, but has
no guidance on where to start. When the wiki is empty (no pages in `wiki/`), the home page
should show a gentle onboarding prompt.

Modify `src/app/page.tsx`:

- Create a server component that checks if any wiki pages exist by calling
  `listWikiPages()` from `src/lib/wiki.ts`
- If the wiki is empty (0 pages), render an onboarding section between the hero and the
  feature cards:
  - A styled callout/card with a title like "Getting Started"
  - Brief text: "Your wiki is empty. Start by ingesting your first source — paste a URL
    or some text and the LLM will create your first wiki page."
  - A prominent CTA button linking to `/ingest`
  - Maybe a secondary note: "No LLM key yet? Configure one in Settings →" linking to
    `/settings`
- If the wiki has pages, show a brief stat line instead: "Your wiki has N pages" with a
  link to browse

This is a server component already (no "use client" directive), so calling `listWikiPages()`
directly is fine — no API call needed.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

SCHEMA.md should reflect the current auto-fix coverage. The home page should render
correctly in both empty and populated wiki states.
