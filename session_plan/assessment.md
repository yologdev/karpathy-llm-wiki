# Assessment — 2026-04-22

## Build Status
✅ PASS — `pnpm build` clean, `pnpm lint` clean, `pnpm test` passes 997 tests across 30 test files (zero failures)

## Project State
The founding vision is fully implemented. All four pillars are complete:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview UI, raw source persistence, SSRF protection |
| **Query** | ✅ | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM auto-fix, configurable per-check |
| **Browse** | ✅ | Wiki index with sort/filter/date-range, page view with backlinks, CRUD (edit/delete/create), revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export |

Additional infrastructure: CLI tool (`ingest`, `query`, `lint`), onboarding wizard, dark mode, multi-provider LLM (Anthropic/OpenAI/Google/Ollama), contextual error hints, mobile-responsive layout, accessibility (skip-nav, ARIA landmarks, focus management).

## Recent Changes (last 3 sessions)

| Date | Session | Summary |
|------|---------|---------|
| 2026-04-21 ~14:00 | ~38 | Graph DPR fix (devicePixelRatio accumulation), magic number consolidation into `constants.ts`, frontmatter preservation in `saveAnswerToWiki`, route-level error boundaries for 7 pages that were missing them |
| 2026-04-21 ~03:29 | ~37 | CLI tool (`src/cli.ts`), contextual error hints in `PageError` boundary, consolidated scattered `process.env` reads in embeddings/llm into single-point-of-access functions |
| 2026-04-20 ~14:00 | ~36 | Accessibility foundations: skip-nav, ARIA landmarks, focus management; test noise cleanup; flaky revisions test fix |

All three recent sessions were polish/hardening — no new features, just bug fixes, accessibility, and code quality.

## Source Architecture

### Codebase size: ~27,200 lines across 129 files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 30 | ~6,400 | Core logic (ingest, query, lint, embeddings, config, lifecycle, bm25, search, etc.) |
| `src/lib/__tests__/` | 30 | ~13,000 | Test suite (997 tests) |
| `src/app/` (pages) | 13 | ~2,600 | Next.js pages |
| `src/app/api/` (routes) | 18 | ~1,100 | API routes |
| `src/components/` | 22 | ~2,900 | React components |
| `src/hooks/` | 2 | ~510 | Custom hooks (useSettings, useStreamingQuery) |

### Largest source files (potential decomposition candidates)
- `lint.ts` — 625 lines (7 checks + structural logic)
- `graph/page.tsx` — 488 lines (canvas rendering + force sim)
- `query.ts` — 476 lines (search + ranking + synthesis)
- `embeddings.ts` — 465 lines (vector store + embed + search)
- `ingest.ts` — 464 lines (fetch + chunk + LLM + write)
- `lint-fix.ts` — 458 lines (7 fix handlers)

### Key architectural patterns
- All page mutations go through `lifecycle.ts` (index, log, embeddings, cross-refs, revisions)
- File locking via `lock.ts` for shared files (single-process only)
- Page caching via `wiki.ts` `withPageCache` for batch operations
- Config resolution: env vars → JSON config file → defaults (`config.ts`)
- LLM calls: retry with backoff for sync, SDK `maxRetries` for streaming (`llm.ts`)

## Open Issues Summary
**No open issues.** All 3 historical issues are closed (bootstrap, AI SDK migration, status report). The project is community-quiet — no external feature requests pending.

## Gaps & Opportunities

### From the founding vision (`llm-wiki.md`) — remaining gaps:
1. **Image/asset handling** — "Download images locally" tip in founding vision. Currently images in source HTML are dropped during ingest. No asset pipeline exists.
2. **Dataview-style queries** — Founding vision mentions "Dataview plugin that runs queries over page frontmatter." Frontmatter exists but no dynamic query UI.
3. **Marp slide deck generation** — Founding vision mentions Marp for presentations from wiki content. Not implemented.
4. **Schema co-evolution via LLM** — "You and the LLM co-evolve this over time." SCHEMA.md is manually maintained; the LLM doesn't autonomously suggest schema updates.

### From YOYO.md — remaining capability gaps:
1. **CLI tool completion** — `src/cli.ts` exists with arg parsing but is not wired to actually call core library functions end-to-end (journal entry 2026-04-21 notes this as "next").
2. **E2E/integration tests** — No Playwright/Cypress tests. Only unit/integration tests via vitest.
3. **Obsidian plugin** — Export function exists (`export.ts`) but no real Obsidian plugin.
4. **Multi-user / auth** — Listed as open question, not started.
5. **Vector search for Anthropic-only users** — Anthropic has no embedding API; these users get BM25-only.

### Quality & polish opportunities:
1. **Query re-ranking quality** — Repeatedly noted as "next" across 15+ journal entries but never prioritized. The current approach narrows candidates to BM25/vector fusion results before LLM re-ranking, but the ranking quality itself hasn't been evaluated or tuned.
2. **Large file decomposition** — `lint.ts` (625), `graph/page.tsx` (488), `query.ts` (476), `embeddings.ts` (465) are the remaining large files. Previous sessions decomposed many others but these four persist.
3. **Status report is stale** — Last updated 2026-04-20, reports 964 tests but actual count is now 997. Metrics are drifting.

## Bugs / Friction Found

### From build output:
- **None.** Build, lint, and all 997 tests pass cleanly.

### From code review / journal:
1. **CLI not functional end-to-end** — `cli.ts` parses args but the journal explicitly says "wire the CLI to actually call the core library functions end-to-end" as a TODO. Users running `pnpm cli ingest <url>` get arg parsing but the actual ingest pipeline may not execute.
2. **`process.env` reads still bypass config** — Status report lists this as tech debt item #1. Session 37 consolidated some reads in embeddings/llm, but audit isn't complete.
3. **Silent error swallowing** — Status report lists as tech debt item #3. Improved but not fully resolved.
4. **Single-process file locking** — `lock.ts` only protects within one Next.js process. Multiple processes (e.g., dev + CLI simultaneously) can race. Documented in SCHEMA.md but not fixed.
5. **Test stderr noise** — Some tests emit expected error messages to stderr (visible in test output: "LLM coverage gap check failed", "load history failed"). Not bugs but noisy.
