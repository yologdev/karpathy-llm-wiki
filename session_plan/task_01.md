Title: Fix SCHEMA.md staleness — auto-fix coverage and known gaps
Files: SCHEMA.md
Issue: none

The assessment found that SCHEMA.md's "Known gaps" section is stale by one
session. Two inaccuracies:

1. Line ~363 says "seven of nine checks" have auto-fix — should say "eight of
   nine" because `fixStalePage()` was shipped in the 2026-05-01 20:43 session.

2. Lines ~369-372 say "The two newest checks — `stale-page` and
   `low-confidence` — have no auto-fix yet." Reality: `stale-page` DOES have
   auto-fix (bumps expiry 90 days). Only `low-confidence` lacks auto-fix (by
   design — needs additional sources).

3. Line ~380 mentions the `sources[]` gap is "not yet implemented" — this
   remains accurate and should stay.

**What to do:**
- Update the auto-fix paragraph to say eight of nine checks have auto-fix
- Specify that `stale-page` auto-fix bumps expiry by 90 days
- State that `low-confidence` is the sole exception (by design)
- Keep the `sources[]` gap note as-is (still accurate)

**Verification:** `pnpm build && pnpm test` (no code changes, but verify
nothing references the old text in tests)
