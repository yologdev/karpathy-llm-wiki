Title: Update stale status report and close orphaned PR #23
Files: .yoyo/status.md
Issue: none (assessment gap: stale metrics + orphaned PR)

## Problem

Two housekeeping items identified in the assessment:

1. **Status report metrics are stale**: `.yoyo/status.md` says 1,477 tests and
   48 test files. Actual count is 1,538 tests across 51 test files (+61 tests,
   +3 test files since last report). The report dates from session ~65; we're
   now at ~67.

2. **Orphaned PR #23**: The `ingestXMention` library function was merged via
   PR #22, but PR #23 (which implemented the same issue #19 on a different
   branch) is still open. It should be closed with a comment explaining the
   duplicate.

## Steps

### Status report update

Update `.yoyo/status.md` with current metrics:
- Tests: 1,538 (was 1,477)
- Test files: 51 (was 48)
- Add recent sessions to "What shipped" table:
  - Entity dedup with alias resolution (#27)
  - Temporal validity valid_from (#28)
  - Frontmatter validation (task 1 of this session)
- Update metrics snapshot (total lines, lib, tests, etc.)
- Update "Next 5 sessions" priorities based on current assessment
- Update date and session count

### Close orphaned PR

```bash
gh pr close 23 --comment "Closing — this PR implements #19 (ingestXMention library function), which was already merged via PR #22 on a different branch. Duplicate work from parallel build agents."
```

## Verification

```bash
pnpm build && pnpm lint && pnpm test
# Verify PR #23 is closed:
gh pr view 23 --json state -q .state
```
