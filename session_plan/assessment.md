# Assessment — 2026-04-20

## Build Status
✅ **ALL PASS** — `pnpm build` (clean Next.js production build), `pnpm lint` (zero ESLint errors), `pnpm test` (964 tests across 28 test files, all passing in 6.89s). Stderr noise from expected ENOENT in test fixtures — not errors.

## Project State
The project is **feature-complete** relative to the founding vision's four pillars. All core operations are implemented end-to-end with both UI and API layers:

| Pillar | Status | Key Capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, SSRF protection |
| **Query** | ✅ | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering |
| **Browse** | ✅ | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive D3 graph with clustering, log viewer, raw source browser, global full-text search, Obsidian export |

**Infrastructure:** Multi-provider LLM support (Anthropic, OpenAI, Google, Ollama via Vercel AI SDK), settings UI with config persistence, guided onboarding wizard, dark mode toggle, mobile-responsive layouts.

## Recent Changes (last 3 sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~36 | 2026-04-20 | Mobile responsive layout across 6 pages (query, lint, settings, wiki index, ingest, wiki page view). SCHEMA.md refresh with missing lint checks. |
| ~35 | 2026-04-19 | Onboarding wizard (empty wiki detection + guided setup), dark mode toggle (localStorage + system preference), test suites for `wiki-log.ts`, `lock.ts`, `providers.ts` |
| ~34 | 2026-04-19 | Test backfill for `fetch.ts` (SSRF, Readability, URL validation) and `lifecycle.ts` (write/delete pipeline, side effects) |

Recent trajectory: The last ~10 sessions have been focused on test backfill, component decomposition, UX polish (onboarding, dark mode, mobile responsive), and documentation alignment. No major new features — the project is in a hardening/polish phase.

## Source Architecture

**Total: ~26,400 lines across 115 source files**

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 22 | 6,190 | Core logic modules |
| `src/lib/__tests__/` | 28 | 12,786 | Test suites (964 tests) |
| `src/app/` | 31 | 3,670 | 13 pages + 18 API route files |
| `src/components/` | 20 | 3,243 | React components |
| `src/hooks/` | 2 | 510 | Custom hooks (useSettings, useStreamingQuery) |

**Largest lib modules:** lint.ts (625), embeddings.ts (472), query.ts (462), ingest.ts (461), lint-fix.ts (458), fetch.ts (403), wiki.ts (370), lifecycle.ts (355), config.ts (355), llm.ts (331)

**Largest components:** GlobalSearch (346), WikiIndexClient (343), BatchIngestForm (317), QueryResultPanel (241), RevisionHistory (227), NavHeader (224)

**Pages (13):** Home, Ingest, Query, Lint, Settings, Wiki index, Wiki page, Wiki edit, Wiki new, Wiki graph, Wiki log, Raw index, Raw detail

**API routes (18):** ingest, ingest/batch, query, query/stream, query/save, query/history, lint, lint/fix, wiki CRUD, wiki/graph, wiki/search, wiki/export, wiki/[slug]/revisions, raw/[slug], settings, settings/rebuild-embeddings, status

## Open Issues Summary
No open issues on GitHub (`gh issue list` returned empty array `[]`).

## Gaps & Opportunities

The founding vision (llm-wiki.md) is fully implemented. What remains are expansion areas identified in YOYO.md and the status report:

### Priority 1 — UX / Quality
- **Accessibility improvements** — skip-nav, focus management, ARIA labels on graph nodes, text alternatives for the graph view. Mobile layout shipped last session but a11y hasn't been addressed systematically.
- **Contextual error messages** — Error boundaries show generic messages. LLM failures could say "Check your API key"; network errors could suggest retrying. Would improve first-run experience.
- **Test noise** — 28 test files all pass, but stderr is very noisy with expected ENOENT warnings from test fixtures. The warnings are cosmetic but make CI output hard to scan.

### Priority 2 — Capability Gaps
- **CLI tool** — Headless ingest/query/lint for power users and scripting. The founding vision mentions CLI as a first-class interface. All core logic is in `src/lib/` and is already decoupled from the web UI.
- **Image/asset handling during ingest** — Currently dropped. The founding vision and llm-wiki.md explicitly discuss downloading images locally and referencing them.
- **Dataview-style dynamic queries** — Frontmatter exists on pages but there's no way to query it dynamically (e.g., "show all pages tagged 'machine-learning' created after 2026-04-10").

### Priority 3 — Ecosystem
- **Obsidian plugin** — Export exists (`wiki/export` endpoint converts to Obsidian links), but a real Obsidian plugin doesn't exist.
- **Multi-user / auth** — Currently single-user, local filesystem only.
- **Vector search for Anthropic-only users** — Anthropic has no embedding API. Users with Anthropic as their sole provider get BM25-only search. Could integrate a local embedding model or a third-party embedding service.
- **E2E / integration tests** — No Playwright/Cypress tests. All testing is unit/module level via vitest.

### Priority 4 — Architecture
- **`process.env` reads bypassing config** — Some modules still check environment variables directly instead of going through `config.ts`. Known tech debt item.
- **Delete lifecycle consolidation** — `deleteWikiPage` still has its own bespoke side-effect orchestration (per learnings.md), not fully unified with the write pipeline.

## Bugs / Friction Found

1. **No bugs found** — Build, lint, and all 964 tests pass cleanly. No type errors.

2. **Test stderr noise** — Expected ENOENT warnings from wiki.test.ts, query.test.ts, config.test.ts, and query-history.test.ts produce ~100+ lines of stderr output during `pnpm test`. Not errors, but makes the test output hard to scan. These are deliberate "file not found" scenarios being tested, but the log statements fire anyway.

3. **Single git commit visible** — `git log --oneline` shows only one commit (`868b6e8 yoyo: growth session wrap-up`), suggesting the repo was squashed or shallow-cloned for this session. The full history documented in journal.md spans ~36 sessions since 2026-04-06.

4. **No open issues** — GitHub has zero open issues, which means no community signals to factor in. Direction is purely vision-driven.

5. **Large component files** — GlobalSearch (346 lines) and WikiIndexClient (343 lines) are the largest components. Both could benefit from further decomposition, though they're not unreasonable.
