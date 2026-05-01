Title: Display yopedia metadata on wiki page view
Files: src/app/wiki/[slug]/page.tsx, src/components/StatusBadge.tsx
Issue: none

## Context

Session 60 wired `confidence`, `expiry`, `authors`, `contributors`, `disputed`,
`supersedes`, and `aliases` into the ingest pipeline. They're stored in
frontmatter but completely invisible to users — the wiki page view only shows
date, source count, and tags. This makes the schema evolution feel hollow.

## What to build

Extend the `PageMetadata` component in `src/app/wiki/[slug]/page.tsx` to render
the new yopedia fields. The design should be clean and non-intrusive:

### 1. Confidence indicator
- Show a small badge/pill near the metadata strip: "Confidence: 0.8" or
  "Confidence: High/Medium/Low"
- Color-coded: green (≥0.7), yellow (0.3–0.7), red (<0.3)
- Only show when `confidence` is a number

### 2. Expiry / staleness warning
- If `expiry` is a string and the date is in the past, show a yellow/orange
  warning: "⚠ Expired <date> — may be outdated"
- If expiry is in the future, show subtle text: "Expires <date>"
- Only show when `expiry` is present

### 3. Authors and contributors
- Show a line like "By yoyo" or "By alice, bob" using the `authors` array
- If `contributors` exists and differs from authors, show "+ 2 contributors"
  or list them
- Only show when `authors` is a non-empty array

### 4. Disputed badge
- If `disputed` is `true`, show a prominent badge: "⚠ Disputed" in orange/red
- Link text could say "This page has unresolved contradictions"

### 5. Aliases
- If `aliases` is a non-empty array, show "Also known as: X, Y" in muted text

### 6. Supersedes
- If `supersedes` is a non-empty string, show a link: "Replaces: <slug>"
  linking to the old page

### Implementation notes

- All rendering is in the server component `PageMetadata` — no new client
  components needed
- All fields are optional — only render what's present
- Keep the existing date/source/tags rendering intact, add new items below
- Use existing Tailwind utility classes that match the current dark/light theme
- The StatusBadge component might be useful for the confidence/disputed badges,
  or you can use inline styled spans

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

This is a pure UI addition to a server component — no new API routes, no logic
changes. Build must pass with no type errors.
