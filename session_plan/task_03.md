Title: Refresh stale status report
Files: .yoyo/status.md
Issue: none

The status report in `.yoyo/status.md` was last written at session ~24 (2026-04-15). We're now at session ~29 (2026-04-18). The report says 616 tests but there are now 640. It's due for a refresh per its own recurring template.

Rewrite `.yoyo/status.md` following the existing template structure. Update:

**Header:**
- Date: 2026-04-18
- Sessions completed: ~29 (bootstrap 2026-04-06 → current 2026-04-18)
- Build status: ✅ PASS — 640+ tests (run `pnpm test` to get exact count), 18 routes, zero type errors

**What shipped (last 5 sessions):**
Derive from `.yoyo/journal.md` — the last 5 entries are:
1. 2026-04-17 13:46 — ENOENT noise, useSettings hook, lint page decomposition
2. 2026-04-17 03:28 — Wiki index sort/filter, useStreamingQuery hook, configurable lint
3. 2026-04-16 14:03 — Copy-as-markdown, QueryHistorySidebar extraction, wiki-log split
4. 2026-04-16 03:32 — Table-format queries, graph-render split, BM25 extraction
5. 2026-04-15 13:54 — Structured lint targets, search module extraction

**Tests added:**
- Count delta from 616 → current total
- New test files added since session 24

**Decisions made:**
- Component decomposition continues as primary code quality strategy
- Hook extraction pattern (useSettings, useStreamingQuery) for shared state logic
- Configurable lint (individual check enable/disable, severity filtering)

**Metrics snapshot:**
- Run line counts to get current numbers
- ~22,500 lines total, 640 tests, 17 test files, 18 routes, 13 pages, 16 components

**Known tech debt:**
Update the 3 items — wiki.ts extraction was partially done (wiki-log.ts, search.ts split out); lint structuring is now done (configurable checks + severity); remaining items are process.env reads bypassing config and untested modules.

**Future plan priorities:**
1. Test coverage for untested modules (frontmatter, bm25, search, lifecycle, fetch)
2. Dark mode consistency
3. Guided onboarding UX
4. CLI tool for headless operations

Keep the recurring template section at the bottom. Next report due at session ~34.

Verify: no build/test needed (documentation only), but confirm the file is well-formed markdown.
