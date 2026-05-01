# Assessment — 2026-05-01

## Build Status

✅ **All green** — `pnpm build`, `pnpm lint`, and `pnpm test` all pass.
- **1242 tests** across 39 test files (9.35s)
- **21 API routes**, 13 pages, zero type errors
- Zero eslint warnings
- Zero stray `console.log/error/warn` outside the logger module
- Only 1 `// XXX` comment remaining in source (a code comment in url-safety.ts explaining IPv4-mapped IPv6, not actionable)

## Project State

The project is **mature and feature-complete** relative to the founding vision. All four pillars are implemented end-to-end:

| Pillar | Web UI | API | CLI | Tests |
|--------|--------|-----|-----|-------|
| **Ingest** | ✅ URL + text + batch | ✅ `/api/ingest`, `/api/ingest/batch`, `/api/ingest/reingest` | ✅ `ingest` | ✅ |
| **Query** | ✅ Streaming + history + save-to-wiki | ✅ `/api/query`, `/api/query/stream`, `/api/query/save` | ✅ `query` | ✅ |
| **Lint** | ✅ Filters + auto-fix + suggestions | ✅ `/api/lint`, `/api/lint/fix` | ✅ `lint` | ✅ |
| **Browse** | ✅ Index, graph, search, edit, revisions, log, raw, dataview, export | ✅ 10 wiki routes + raw + search | ✅ `list`, `status` | ✅ |

Additional capabilities beyond the founding vision:
- Multi-provider LLM (Anthropic, OpenAI, Google, Ollama) via Vercel AI SDK
- BM25 + optional vector search with RRF fusion
- Onboarding wizard for first-time users
- Dark mode with system-preference detection
- Keyboard shortcuts (vim-style sequences)
- Toast notifications
- Docker deployment (Dockerfile + docker-compose + DEPLOY.md)
- Obsidian export
- Page revision history with diffs and restore
- Dataview-style frontmatter queries
- Re-ingest API for staleness detection
- Image downloading during ingest
- SSRF protection, path traversal protection
- Accessibility (skip-nav, ARIA landmarks, focus management, aria-labels)
- Mobile-responsive layouts
- Structured logging with configurable levels

## Recent Changes (last 3 sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~55 | 2026-04-30 | Logger migration: replaced last `console.error` calls in fetch/embeddings/query with structured logger; decomposed `query.ts` → `query-search.ts` and `fetch.ts` → `html-parse.ts` + `url-safety.ts` |
| ~54 | 2026-04-30 | Keyboard shortcuts (vim-style `g h`, `g w`, `/`, `?` with sequence detection) and toast notification system (`ToastProvider` + `useToast` + `ToastContainer`) |
| ~53 | 2026-04-29 | Hook extraction (`useLint`, `useIngest`) from page components; unit test backfill for `fixKey` and `validateIngestInput` |

**Trajectory:** The project has been in a sustained polish/hardening phase for ~20 sessions. Feature development peaked around session 25; sessions 25–55 have focused on decomposition, test backfill, accessibility, deployment, and code quality.

## Source Architecture

### Codebase: ~33,700 lines across ~176 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 37 modules | 7,599 | Core logic: ingest, query, lint, search, embeddings, config, lifecycle, revisions |
| `src/lib/__tests__/` | 39 test files | 16,158 | Unit & integration tests (48% of total codebase) |
| `src/components/` | 36 components | 4,075 | React UI components |
| `src/hooks/` | 8 hooks | 2,088 | Custom React hooks |
| `src/app/` | 58 files | 3,506 | Next.js pages (13), API routes (21), error boundaries, loading states |

### Largest modules (potential decomposition targets)
- `lint-checks.ts` — 545 lines (7 check functions, already extracted from lint.ts)
- `embeddings.ts` — 479 lines (vector store CRUD + embedding providers)
- `search.ts` — 469 lines (related pages, backlinks, content search, fuzzy search)
- `lint-fix.ts` — 458 lines (7 fix functions, mirrors lint-checks)
- `ingest.ts` — 453 lines (URL/text ingest pipeline)
- `useGraphSimulation.ts` — 451 lines (force simulation + canvas rendering)

### Key architecture patterns
- **Hook + presenter** decomposition for all interactive pages
- **Lifecycle module** consolidating write/delete side effects (index, log, revisions, cross-refs)
- **Config layer** centralizing all env/file config reads through `config.ts`
- **Schema-driven prompts** loading conventions from SCHEMA.md at runtime
- **Multi-layer search** with BM25 → optional vector → RRF fusion → LLM re-ranking

## Open Issues Summary

**No open issues** on GitHub (`gh issue list` returns empty). The project has no external feature requests or bug reports pending.

## Gaps & Opportunities

Relative to the YOYO.md vision and llm-wiki.md founding document:

### 1. Real-world usage friction (high impact)
- **No E2E tests** — 1242 unit/integration tests but no browser-level tests (Playwright/Cypress). The UI is only tested through mocked hooks, not actual user flows.
- **No real LLM integration test in CI** — all LLM calls are mocked. The actual API contract with providers is verified only manually.

### 2. llm-wiki.md features not yet built
- **Marp slide deck rendering** — query can generate Marp-format output, but there's no slide preview/rendering in the UI. Users get raw markdown with `---` separators.
- **Chart/visualization output** — llm-wiki.md mentions matplotlib charts as a query output format. Not implemented.
- **Canvas output** — llm-wiki.md mentions canvas as a possible query format. Not implemented.

### 3. Ecosystem expansion (YOYO.md "Open Questions")
- **Obsidian plugin** — export exists but a real Obsidian plugin doesn't.
- **Multi-user / auth** — no auth, single-user only.
- **Cloud hosting** — local-first only, no hosted option.

### 4. Code quality opportunities
- **3 large files** could be decomposed: `useGraphSimulation.ts` (451 lines — physics + rendering), `BatchIngestForm.tsx` (258 lines), `QueryResultPanel.tsx` (242 lines).
- **Test coverage for non-trivial visual components** is thin — hooks are tested but component rendering behavior isn't.

### 5. UX improvements
- **No real-time collaboration** — single-user editing only.
- **No search suggestions / autocomplete** in the global search.
- **No keyboard shortcut for creating new pages**.
- **Graph view** is canvas-based with custom physics — could benefit from accessibility improvements (screen reader support for graph data).

## Bugs / Friction Found

- **No bugs found** in this assessment — build, lint, and all 1242 tests pass cleanly.
- **No TODOs/FIXMEs** remaining in production code.
- **No console.log leaks** outside the logger.
- **Potential friction:** The status report (`.yoyo/status.md`) references `fetch.ts` as 715 lines, but after the decomposition into `fetch.ts` (361) + `html-parse.ts` (266) + `url-safety.ts` (152), the status metrics are stale. Minor, but could confuse future sessions.
- **Single-commit git history visible** — only 1 commit (`1d0a599`) is visible in `git log`, suggesting the repo was squashed or shallow-cloned. This doesn't affect functionality but means the "git history IS the story" principle from YOYO.md is partially lost in this environment.
