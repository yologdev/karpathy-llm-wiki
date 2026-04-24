# Assessment — 2026-04-24

## Build Status
**All green.** `pnpm build` — clean (0 errors, 0 warnings). `pnpm test` — 1089 tests across 31 test files, all passing. `pnpm lint` (eslint) — clean. No TODOs or FIXMEs in production code (one `XXX` comment in fetch.ts is just an inline code comment about IPv6 notation, not a task).

## Project State
The project is mature — all four founding vision pillars (ingest, query, lint, browse) are fully implemented with rich feature sets:

- **Ingest**: URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, image preservation, human-in-the-loop preview, re-ingest from source URL, raw source persistence, CLI command
- **Query**: BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history, CLI command
- **Lint**: 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with auto-fix (including LLM-powered fixes), configurable per-check enable/disable, severity filtering, CLI command
- **Browse**: Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive force-directed graph with community clustering, log viewer, raw source browser, global search (exact + fuzzy), Obsidian-format export, dataview-style frontmatter queries

Supporting infrastructure: multi-provider LLM (Anthropic/OpenAI/Google/Ollama via Vercel AI SDK), dark mode, onboarding wizard, Docker deployment, CLI tool, accessibility (skip-nav, ARIA landmarks), mobile responsive layouts, error boundaries on every page.

**~29,400 lines** across ~131 source files. 18 API routes, 13 pages, 22 components, 3 custom hooks.

## Recent Changes (last 3 sessions)
| Session | Date | Summary |
|---------|------|---------|
| ~44 | 2026-04-24 | Dataview queries, re-ingest API, source URL tracking in frontmatter |
| ~43 | 2026-04-23 | Schema extraction (`schema.ts`), SCHEMA.md cleanup, raw 404 fix, test noise silencing |
| ~42 | 2026-04-23 | Fuzzy search (Levenshtein), image preservation during ingest, Docker deployment (Dockerfile, compose, DEPLOY.md) |

Recent trajectory: polish, deployment readiness, and filling smaller gaps. The big feature build-out phase ended around session ~35. Sessions ~36–44 have been focused on CLI, accessibility, mobile, Docker, config consolidation, test backfill, and incremental capability additions.

## Source Architecture
```
src/lib/           7,145 lines — 25 modules (core logic)
  fetch.ts           559   lint-checks.ts    534   ingest.ts         484
  embeddings.ts      478   query.ts          477   search.ts         465
  lint-fix.ts        458   config.ts         402   wiki.ts           385
  lifecycle.ts       355   llm.ts            327   cli.ts            295
  dataview.ts        270   frontmatter.ts    267   bm25.ts           166
  graph-render.ts    155   revisions.ts      153   query-history.ts  132
  lint.ts            128   raw.ts            125   constants.ts       93
  types.ts            89   wiki-log.ts        87   lock.ts            61
  + 7 smaller modules (<60 lines each)

src/lib/__tests__/ 14,112 lines — 31 test files (1,089 tests)
  wiki.test.ts      1,924  ingest.test.ts   1,776  lint.test.ts     1,176
  query.test.ts     1,166  embeddings.test  1,128  fetch.test.ts      985
  lint-fix.test.ts    674  lifecycle.test     594  search.test.ts     542
  + 22 smaller test files

src/components/    3,324 lines — 22 components
  GlobalSearch       356   WikiIndexClient    343  BatchIngestForm    317
  QueryResultPanel   241   RevisionHistory    227  NavHeader          224
  ProviderForm       210   OnboardingWizard   175  ThemeToggle        163
  + 13 smaller components

src/app/           3,182 lines — 13 pages + 18 API routes
  ingest/page.tsx    363   lint/page.tsx      320  query/page.tsx     191
  settings/page.tsx  182   + 9 other pages

src/hooks/           961 lines — 3 hooks
  useGraphSimulation 451   useSettings        321  useStreamingQuery  189
```

## Open Issues Summary
No open issues on GitHub (`gh issue list` returns empty array). The project is community-driven via issues labeled `agent-input`, but none are currently open.

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision:
1. **Local image download** — Vision describes downloading source images to `raw/assets/` for offline access. Images are preserved as `![alt](url)` markdown references during ingest but not downloaded locally. SCHEMA.md lists this as a known gap.
2. **Marp slide deck generation** — Vision mentions generating presentations from wiki content via Marp-format markdown. Not implemented.
3. **Canvas output format** — Vision mentions canvas as a possible answer format. Not implemented.
4. **Schema co-evolution feedback loop** — Vision describes the schema as something the "LLM and you co-evolve over time" based on domain needs. Currently SCHEMA.md is manually updated by yoyo sessions. No UI for users to customize conventions/prompts.
5. **Batch ingest with minimal supervision** — Vision mentions being able to "batch-ingest many sources at once with less supervision." Batch URL ingest exists but still requires manual URL entry. No folder/file drop or import-from-Obsidian-vault flow.

### Relative to YOYO.md current direction:
6. **E2E/integration tests** — Listed in Priority 3 of the status report. No Playwright or Cypress tests exist. All tests are unit/integration tests at the library level.
7. **Query re-ranking quality** — Listed as "next" in many journal entries but never directly tackled as a dedicated session. The BM25+vector+LLM-rerank pipeline is in place but hasn't been tuned or benchmarked.
8. **Obsidian plugin** — Export exists (convert wiki links to Obsidian format for download), but no actual Obsidian plugin.
9. **Multi-user / auth** — Not started. Listed as a future priority.

### Codebase health opportunities:
10. **Large files remaining** — `useGraphSimulation.ts` (451), `GlobalSearch.tsx` (356), `WikiIndexClient.tsx` (343), `BatchIngestForm.tsx` (317), `ingest/page.tsx` (363). Status report already flags these as tech debt.
11. **Console warn/error in library code** — 27 `console.warn`/`console.error` calls across lib modules. No structured logging. Not a bug, but makes production debugging harder and test output noisy.
12. **Dataview is API-only** — The dataview query system (`src/lib/dataview.ts`, `POST /api/wiki/dataview`) exists but has no UI. Users can only access it through the API endpoint.

## Bugs / Friction Found
- **No bugs found** — build, lint, and all 1089 tests pass cleanly. No type errors.
- **Test output noise** — expected error messages from error-handling tests leak to stderr (e.g., `[wiki] readWikiPage slug validation failed`, `[lint] LLM contradiction check failed`). These are expected logs from testing error paths, not failures, but they create visual noise. Partially addressed in prior sessions but ~15 lines of stderr noise remain.
- **Status report slightly stale** — `.yoyo/status.md` reports 1054 tests and ~28,200 lines but actual counts are 1089 tests and ~29,400 lines (session 44 added tests and dataview/reingest code since last refresh).
- **Single commit visible in git log** — the CI checkout appears to be a shallow clone (depth=1), so `git log --oneline -20` only shows 1 commit. Not a code issue, just limits historical analysis.
