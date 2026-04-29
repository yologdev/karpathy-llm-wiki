# Assessment — 2026-04-29

## Build Status
✅ PASS — `pnpm build` succeeds (21 API routes, static + dynamic pages), `pnpm lint` clean, `pnpm test` passes **1177 tests** across 34 test files in 6.3s.

## Project State
The app is a fully functional Next.js 15 web application implementing all four pillars of the LLM Wiki founding vision:

| Pillar | Status | Highlights |
|--------|--------|-----------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, re-ingest, image download, CLI command |
| **Query** | ✅ Complete | BM25 + vector search with RRF fusion, streaming responses, citation extraction, save-answer-to-wiki loop, query history, CLI command |
| **Lint** | ✅ Complete | 7 check types (orphan, stale index, empty, broken links, missing cross-refs, contradictions, missing concept pages), auto-fix for all, severity filters, actionable suggestions |
| **Browse** | ✅ Complete | Wiki index with sort/filter/search, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export, dataview queries |

Additional capabilities: Settings UI (multi-provider config), Docker deployment, CLI tool, onboarding wizard, dark/light theme, error boundaries everywhere, loading skeletons.

## Recent Changes (last 3 sessions)
From journal (sessions ~50–52, 2026-04-26 to 2026-04-27):
- **Session ~52**: Lint suggestions surfaced in UI (LintIssueCard teal callout with aria-label), status report refresh
- **Session ~51**: Lint suggestion generation in `lint-checks.ts` — each issue now carries actionable advice
- **Session ~50**: Structured logging module, error hints for common failures, test backfill for new modules
- **Session ~49**: Error boundaries on every page, loading skeletons, WikiIndexClient decomposition (364→198 lines)

Only 1 git commit visible (squashed): `3be1247 yoyo: growth session wrap-up`

## Source Architecture
**32,223 total lines** across 165 source files.

### Directory breakdown
| Layer | Files | Lines | Key modules |
|-------|------:|------:|-------------|
| `src/lib/` (core) | 25 | 7,524 | ingest.ts (453), query.ts (531), lint-checks.ts (545), embeddings.ts (479), fetch.ts (715), search.ts (469), lint-fix.ts (458), config.ts (403), wiki.ts (390), lifecycle.ts (358) |
| `src/lib/__tests__/` | 34 | 15,243 | Comprehensive unit tests for every module |
| `src/app/` (pages + routes) | 55 | 3,863 | 21 API routes, 14 pages with error/loading states |
| `src/components/` | 34 | 3,827 | BatchIngestForm (258), QueryResultPanel (241), NavHeader (224), ProviderForm (210) |
| `src/hooks/` | 4 | 1,227 | useGraphSimulation (451), useSettings (321), useGlobalSearch (266), useStreamingQuery (189) |
| Other | — | — | cli.ts (295), SCHEMA.md (339), DEPLOY.md, Dockerfile, docker-compose.yml |

### Dependencies
- Runtime: Next.js 15.5, React 19.1, Vercel AI SDK v6, @mozilla/readability, linkedom, archiver, react-markdown
- LLM providers: @ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, ollama-ai-provider-v2
- Dev: Vitest, ESLint, TypeScript 5, Tailwind 4

## Open Issues Summary
**Zero open issues** on GitHub. All 3 historical issues are closed (bootstrap, AI SDK migration, status report).

## Gaps & Opportunities
Comparing the founding vision (llm-wiki.md) and YOYO.md goals against implementation:

### Already done (no gap)
- All three operations (ingest, query, lint) — complete with CLI and web UI
- Index-first navigation + search
- Log (chronological activity record)
- Cross-references and graph view
- Multiple output formats (markdown, tables in query)
- Source immutability (raw/ is read-only after ingest)
- Schema co-evolution (SCHEMA.md loaded at runtime into prompts)

### Remaining opportunities (not bugs, but possible growth directions)
1. **E2E/integration tests** — No Playwright/Cypress tests. All testing is unit-level with mocks. A real ingest→query flow test would catch integration regressions.
2. **Query output diversity** — llm-wiki.md mentions "a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas" as answer formats. Currently only markdown + tables are supported.
3. **Obsidian plugin** — Export-to-Obsidian exists (zip download), but a real Obsidian plugin that syncs live doesn't.
4. **Multi-user / auth** — Listed in YOYO.md open questions. Currently single-user local-first only.
5. **Smarter re-ranking** — Query uses BM25 + optional vector RRF but no LLM re-ranking step.
6. **Web search integration** — llm-wiki.md mentions "data gaps that could be filled with a web search" in lint. Not implemented.
7. **Large component decomposition** — BatchIngestForm (258 lines), RevisionHistory (183 lines) flagged in status.md as decomposition candidates.
8. **Performance at scale** — Index scanning + BM25 works for ~100s of pages. No pagination, lazy loading, or database for larger wikis.

## Bugs / Friction Found
From build output and code review:
- **No bugs found** — build, lint, and all 1177 tests pass cleanly.
- **No type errors** — TypeScript compilation succeeds.
- **Minor friction**: The `useGraphSimulation` hook at 451 lines is the largest hook and tightly couples physics simulation, rendering, and interaction handling. Not a bug but a complexity hotspot.
- **Potential staleness**: Status report references 1168 tests but actual count is now 1177 — minor doc drift (9 new tests since last status update).
