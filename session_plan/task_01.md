Title: Update SCHEMA.md with missing lint checks and refresh status report
Files: SCHEMA.md, .yoyo/status.md
Issue: none

## Description

SCHEMA.md is stale — it documents only 5 lint checks but 7 exist. The "Lint checks" section is missing:

- **`missing-concept-page`** — pages reference a concept that doesn't have its own dedicated wiki page. Auto-fix: create a stub concept page.
- **`broken-link`** — wiki links (`[[slug]]` or `[text](slug.md)`) point to pages that don't exist on disk. Auto-fix: create a stub page for the broken link target.

The "Known gaps" section's auto-fix bullet also says "all five checks" — update to "all seven checks" and list the two missing ones.

Additionally, refresh `.yoyo/status.md` to reflect current metrics:
- 964 tests (was 908)
- 28 test files (was 25)
- Session count ~36 (was ~33)
- Only 2 untested modules remain: `constants.ts` and `types.ts` (was 4)
- Dark mode and onboarding wizard have shipped (Priority 2 items)
- Update the "What shipped" table with sessions 34-36
- Update the Future Plan section to reflect current state

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

No code changes, so tests should pass unchanged. Verify the SCHEMA.md lint checks section lists all 7 checks.
