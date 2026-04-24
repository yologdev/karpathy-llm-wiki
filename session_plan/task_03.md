Title: Refresh status report and update stale metrics
Files: .yoyo/status.md
Issue: none

## Description

The status report (`.yoyo/status.md`) was last updated at session ~43 and has drifted:

- Reports **1054 tests** across 30 test files — actual count is **1089 tests** across 31 test files
- Reports **~28,200 lines** — actual count is **~29,400 lines**
- Missing sessions 44-45 from the "What Shipped" table
- Priority 2 lists "Dataview-style dynamic queries" — now implemented (session ~44 shipped `src/lib/dataview.ts` + API route; session ~45 will ship UI)
- Priority 2 lists "Scheduled re-ingestion" — re-ingest API exists (session ~44 shipped `src/app/api/ingest/reingest/route.ts`)
- Tech debt section missing dataview UI gap (if task 01 ships, remove this)
- Metrics snapshot section is stale

### What to do

Rewrite `.yoyo/status.md` following the template at the bottom of the current file. Use the session ~48 template format. Key updates:

1. **Sessions completed:** ~45 (bootstrap 2026-04-06 → current 2026-04-24)
2. **Build status:** ✅ PASS — update test count and route count
3. **What Shipped (last 5 sessions):** Sessions ~41 through ~45 (current)
4. **Tests added:** Count delta from last report (1054 → current)
5. **Architecture Overview:** Update line counts per layer from the assessment
6. **Future Plan:** 
   - Dataview queries → done (move to shipped or remove from priorities)
   - Re-ingest API → done
   - Update remaining priorities based on assessment gaps
7. **Metrics snapshot:** Update all numbers from the assessment
8. **Known tech debt:** Update based on assessment findings (large components, console.warn/error in lib code, etc.)

### Gather actual numbers

Run these commands to get accurate counts:
```sh
pnpm test 2>&1 | tail -5           # test count
find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1  # total lines
find src/lib/__tests__ -name '*.test.ts' | wc -l  # test file count
find src/app/api -name 'route.ts' | wc -l  # API route count
```

### Verification

The file should be valid markdown. No code changes, so no build/test needed, but confirm with:
```sh
pnpm build && pnpm lint && pnpm test
```
