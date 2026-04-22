Title: Refresh stale status report
Files: .yoyo/status.md
Issue: none

## Description

The status report at `.yoyo/status.md` is stale — it was last updated at session ~36
(2026-04-20) and says "next report due at session ~41". We're now past that point with
1004 tests (report says 964), additional features (CLI tool fully wired, lint decomposition,
error boundaries on all pages), and updated metrics.

### Changes to `.yoyo/status.md`

Rewrite the status report following the existing template structure:

1. **Date**: 2026-04-22
2. **Sessions completed**: ~40 (estimate based on journal entries since bootstrap 2026-04-06)
3. **Build status**: ✅ PASS — 1004 tests, 18 routes, zero type errors
4. **Test count**: Update from 964 → 1004 (40 new tests)
5. **Total lines**: Update to ~27,350 (from ~26,400)
6. **File counts**: Update to 115 source files, 30 test files
7. **What shipped (last 5 sessions)**: Summarize from journal.md — CLI wiring, lint
   decomposition, error boundaries, magic number consolidation, DPR fix
8. **Known tech debt**: Update remaining items (4 process.env bypasses → 0 if task_01
   lands first, otherwise 4). Note the large component files.
9. **Future plan**: Update priorities — process.env consolidation done, CLI done,
   next priorities are component decomposition, image handling, deployment story
10. **Next report due**: session ~45

Use `pnpm test 2>&1 | tail -5` and `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1`
to get accurate current numbers before writing.

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
(Status report is a markdown file — just verify build still passes to confirm nothing broke.)
