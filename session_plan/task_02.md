Title: Contributor badge links to profile + contributor test coverage
Files: src/components/ContributorBadge.tsx, src/lib/__tests__/contributors.test.ts
Issue: none

## Description

Two improvements that tie the contributor system together:

### 1. Make ContributorBadge link to the profile page

Currently `ContributorBadge` renders a `<span>` with a trust dot and the handle text. Make the handle text a clickable link to `/wiki/contributors/[handle]` so users can drill into contributor details from any page that shows author badges.

Change the inner rendering so the handle text becomes a Next.js `<Link>` (or an `<a>` tag, since this is a client component — use a plain `<a href={...}>` for simplicity):
- Wrap the handle text in `<a href={/wiki/contributors/${encodeURIComponent(handle)}}>`
- Add hover underline styling
- Keep the trust dot outside the link (it's decorative)

### 2. Add test coverage for contributors module

Create `src/lib/__tests__/contributors.test.ts` with tests for:
- `buildContributorProfile` returns zeroed profile for unknown handle
- `buildContributorProfile` counts revisions correctly (mock revision data)
- `listContributors` returns empty array when no revisions exist
- `listContributors` sorts by editCount descending
- Trust score computation: verify the heuristic `min(1, (editCount + commentCount) / 50)`

Use vitest mocking to mock `listRevisions`, `listWikiPages`, and the discuss directory filesystem. Follow the pattern from existing tests like `src/lib/__tests__/revisions.test.ts` or `src/lib/__tests__/talk.test.ts`.

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
