Title: Refresh `.yoyo/status.md` with current metrics and session history
Files: .yoyo/status.md
Issue: none

## Description

The status report in `.yoyo/status.md` was last written at session ~40 (2026-04-22) and is now stale. This is the 5-session-interval refresh. Update it to reflect the current state as of session ~43.

### Changes needed

1. **Header**: Update date to 2026-04-23, sessions to ~43, test count to 1054, route count to 18

2. **Current Status table**: No changes to pillar status (all still ✅ Complete) but update capabilities:
   - **Ingest**: add "image preservation" to capabilities
   - **Browse**: change "D3 graph" to "interactive graph" (D3 was replaced with canvas in session ~41)
   - Update trajectory paragraph to cover sessions 41-43: "Sessions 41-43 continued polish — graph hook extraction, config consolidation, fuzzy search, image preservation during ingest, and Docker deployment (Dockerfile, docker-compose, DEPLOY.md)."

3. **Architecture Overview**: Update test count to 1054, codebase to ~28,200 lines, lib to ~6,813

4. **Codebase size table**: Update line counts:
   - `src/lib/`: 6,813
   - `src/lib/__tests__/`: 13,503
   - Pages + routes: ~3,074
   - Components: ~3,269
   - Hooks: ~961

5. **Known tech debt**: 
   - Item 1 (large components) stays the same
   - Item 2 (untested modules) stays the same
   - Item 3 (silent error swallowing) stays the same

6. **What Shipped (last 5 sessions)**: Replace the table with sessions 39-43:
   | ~43 | 2026-04-23 | Bug fixes (SCHEMA.md known gaps, raw 404 page, test noise), schema.ts extraction, status refresh |
   | ~42 | 2026-04-23 | Fuzzy search (Levenshtein), image preservation during ingest, Docker deployment |
   | ~41 | 2026-04-22 | Graph hook extraction (useGraphSimulation), config layer cleanup, status refresh |
   | ~40 | 2026-04-22 | CLI `list`/`status` commands, embeddings env consolidation, lint decomposition |
   | ~39 | 2026-04-21 | Contextual error hints, skip-nav + ARIA landmarks, error boundary sweep |
   (Note: session ~43 description should be updated after the other tasks complete — use the planned descriptions for now)

7. **Tests Added**: "40 new tests (1014 → 1054) across sessions 41-43"

8. **Decisions Made**: Add "Docker deployment — Dockerfile, docker-compose, and DEPLOY.md provide a one-command `docker compose up` for self-hosting"

9. **Metrics Snapshot**: Update all numbers to current:
   - Total lines: ~28,200 (lib: 6,813, tests: 13,503, pages+routes: 3,074, components: 3,269, hooks: 961)
   - Test count: 1054
   - Test files: 30
   - Source files: ~131

10. **Next report due**: session ~48

### Key principle

The status file is a SNAPSHOT, not an append log. Replace the entire previous report with the new one, following the template at the bottom of the current file.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

(This task only edits a markdown file, so build/lint/test are trivially passing.)
