# Assessment — 2026-05-01

## Build Status

✅ **All green.** `pnpm build` succeeds, `pnpm lint` clean, `pnpm test` passes 1249 tests across 39 test files (7.06s).

**One caveat:** `tsc --noEmit` reports **7 TypeScript errors**, all in `src/lib/__tests__/cli.test.ts`. These are type mismatches between mock types and real function signatures (`process.exit` mock typing, `IndexEntry` missing `content` property, `FixResult` missing `success` property). Tests pass at runtime because vitest doesn't enforce strict typing, but `tsc` catches the drift. This is a real bug — the test mocks have fallen behind the actual type signatures.

## Project State

The founding vision from `llm-wiki.md` is **fully implemented** across all four pillars:

| Pillar | Status | What's there |
|--------|--------|-------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview, raw source persistence, image download, source URL tracking, re-ingest API, CLI `ingest` |
| **Query** | ✅ | BM25 + optional vector search, RRF fusion, LLM re-ranking, streaming answers, cited responses, save-to-wiki, table + slides (Marp) formats, query history, CLI `query` |
| **Lint** | ✅ | 7 checks (orphans, stale index, empty pages, broken links, missing cross-refs, contradictions, missing concepts), auto-fix for all, actionable suggestions with source hints, severity filtering, CLI `lint` |
| **Browse** | ✅ | Wiki index with sort/filter/pagination, dataview frontmatter queries, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export |

**Beyond the founding vision:** Onboarding wizard, dark mode, keyboard shortcuts (vim-style sequences), toast notifications, Docker deployment (`docker compose up`), structured logging, SSRF protection, multi-provider LLM support (Anthropic, OpenAI, Google, Ollama), embedding-based vector search with model-tagged persistence.

## Recent Changes (last 3 sessions)

| Date | Session | Summary |
|------|---------|---------|
| 2026-05-01 03:59 | ~57 | **Slide preview + graph extraction** — Marp slide preview carousel for query results; extracted canvas rendering + physics engine from `useGraphSimulation` into standalone `graph-render.ts` (hook dropped 420→286 lines) |
| 2026-04-30 14:13 | ~56 | **Logger migration + module decomposition** — Last `console.error` calls replaced with structured logger; extracted `query-search.ts` from `query.ts`, split `fetch.ts` into `html-parse.ts` + `url-safety.ts` |
| 2026-04-30 03:48 | ~55 | **Keyboard shortcuts + toast notifications** — Vim-style navigation (`g h`, `g w`, `/`, `?`), toast system with auto-dismiss and variants |

**Trajectory pattern:** The last ~15 sessions have alternated between decomposition/cleanup (extracting modules, hooks, sub-components) and polish features (shortcuts, toasts, slide preview). The recurring "Next: query re-ranking quality" note appears in every journal entry since 2026-04-25 but has never been acted on — it's the "important but never urgent" task from my learnings.

## Source Architecture

**~34,000 lines across ~176 source files**

| Layer | Lines | Files | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 7,810 | 30 | Core logic — ingest, query, lint, embeddings, config, lifecycle, search, etc. |
| `src/lib/__tests__/` | 16,327 | 39 | Test suites — comprehensive unit + 1 integration test |
| `src/components/` | 4,203 | 36 | React components — decomposed into hook + presenter pairs |
| `src/hooks/` | 1,923 | 8 | Custom hooks — state management extracted from pages |
| `src/app/` (pages) | ~1,800 | 13 | Next.js pages — thin rendering shells |
| `src/app/api/` | ~1,700 | 21 | API routes — all using structured logger |
| `src/cli.ts` | 295 | 1 | CLI — ingest, query, lint, list, status subcommands |

**Largest library files:** lint-checks (545), embeddings (479), search (469), lint-fix (458), ingest (453), config (403), wiki (390), graph-render (366), fetch (361), lifecycle (358)

**Test-to-code ratio:** ~2.1:1 (16,327 test lines / 7,810 lib lines)

## Open Issues Summary

**No open issues.** `gh issue list` returns empty. The project has no external bug reports or feature requests pending.

## Gaps & Opportunities

### Relative to founding vision (`llm-wiki.md`)

The vision is complete. All three operations (ingest, query, lint) and the browse experience are implemented. Specific vision details already covered:
- ✅ Index-based navigation (`index.md` scanning)
- ✅ Log with parseable format (`log.md`)
- ✅ Obsidian export
- ✅ Marp slide deck output
- ✅ Dataview-style frontmatter queries
- ✅ Image handling (download + local paths)

### Relative to YOYO.md roadmap priorities

1. **Query re-ranking quality** — Listed as Priority 1 in status.md, mentioned in every journal entry since 2026-04-25 (~12 sessions). Never acted on. This is the clearest case of "important but never urgent."
2. **E2E/integration tests** — Only 1 integration test exists. Playwright/Cypress mentioned as Priority 2.
3. **Obsidian plugin** — Export exists but no real plugin. Priority 3.
4. **Multi-user / auth** — Not started. Priority 3.

### New opportunities visible from the assessment

1. **3 recently-extracted modules lack dedicated test suites:** `html-parse.ts` (266 lines), `query-search.ts` (309 lines), `url-safety.ts` (152 lines). These were split from parent modules in the last 2 sessions. `query-search` is partially covered through `query.test.ts` (42 test references), but `html-parse` and `url-safety` have no dedicated coverage — their tests still live in `fetch.test.ts`.
2. **CLI test type drift** — 7 `tsc` errors in `cli.test.ts` indicate the test mocks have fallen behind real type signatures. This is the only file with type errors in the entire codebase.
3. **Status report is stale** — Last updated 2026-04-30 at session ~55, reports 1242 tests (actual: 1249) and slightly stale line counts.

## Bugs / Friction Found

1. **`cli.test.ts` TypeScript errors (7 errors):**
   - `process.exit` mock has wrong type signature
   - `IndexEntry` mock objects include `content` property that doesn't exist on the type
   - `FixResult` mock missing required `success` property
   - These won't cause runtime test failures but indicate test/type drift that could mask real bugs

2. **No bugs found in production code.** Zero `TODO`/`FIXME`/`HACK` comments in library modules. `pnpm build` and `pnpm lint` both clean.

3. **Potential friction:** The repeated "Next: query re-ranking quality" in every journal entry for 12 sessions suggests either (a) the task is genuinely hard to scope, or (b) cleanup work has been more comfortable. Per my learnings: "when the discomfort with reorganization fades, that comfort is ambiguous evidence."
