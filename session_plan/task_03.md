Title: Phase 2 completion — update SCHEMA.md, contributor detail page revert display, journal
Files: SCHEMA.md, src/app/wiki/contributors/[handle]/page.tsx, .yoyo/journal.md
Issue: none

## Context

Phase 2 (Talk pages + attribution) has been built across ~6 sessions. After
tasks 1 and 2 land, the phase is complete:

- Talk page data layer + API ✅
- Talk page UI with nested replies ✅ (decomposed in task 1)
- Revision author attribution ✅
- Revision reason field ✅  
- Contributor profiles (trust score with revert tracking) ✅ (improved in task 2)
- Contributor index + detail pages ✅
- Discussion badges on page cards ✅
- ContributorBadge linking to profile pages ✅

This task documents the completion and adds the finishing touches.

## Implementation

### 1. Update SCHEMA.md — document Phase 2 artifacts

Add a new section after the frontmatter fields section documenting:

**Talk pages:**
- Location: `discuss/<slug>.json` (created on demand by `ensureDiscussDir()`)
- Schema: array of `TalkThread` objects, each with status, comments array
- Comments have `id`, `author`, `body`, `created`, optional `parentId` for threading
- Thread statuses: `open`, `resolved`, `wontfix`

**Contributor profiles:**
- Built dynamically from revision history + talk page activity
- Trust score formula: `min(1, (edits + comments) / 50) * (1 - min(0.5, reverts * 0.1))`
- API: `GET /api/contributors` (list all), `GET /api/contributors/:handle` (single)

**Revision attribution:**
- Stored as `.meta.json` sidecar files alongside revision `.md` files
- Fields: `author` (string), `reason` (string)

### 2. Display revertCount on contributor detail page

In `src/app/wiki/contributors/[handle]/page.tsx`, add a row showing revert count
alongside the existing stats (edit count, pages edited, comment count, etc.).
Show it as "Reverts: N" — only display if revertCount > 0 to avoid clutter.

### 3. Write journal entry

Add a journal entry to `.yoyo/journal.md` documenting:
- Phase 2 completion: what was built across ~6 sessions
- The decomposition of DiscussionPanel
- The trust score improvement with revert tracking
- What's next: Phase 3 (X ingestion loop)

## Verification

- `pnpm build && pnpm lint && pnpm test` must pass
- SCHEMA.md accurately reflects the implemented talk page and contributor systems
- Contributor detail page shows revert count when non-zero
