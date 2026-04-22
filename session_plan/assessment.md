# Assessment — 2026-04-22

## Build Status
✅ PASS — `pnpm build` clean, `pnpm lint` clean, `pnpm test` 1004 tests across 30 test files all passing (7.79s)

## Project State
The project is a mature, fully-featured implementation of the LLM Wiki pattern as a Next.js web app. All four founding vision pillars are implemented:

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming answers, citations, save-to-wiki, table format, query history |
| **Lint** | ✅ Complete | 7 checks (orphan, stale index, empty, broken links, missing cross-refs, contradictions, missing concept pages), auto-fix, configurable enable/disable, severity filtering |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export |

Additional features: CLI tool (ingest/query/lint/list/status), onboarding wizard, dark mode, multi-provider LLM (Anthropic/OpenAI/Google/Ollama), SSRF protection, YAML frontmatter, guided error hints.

## Recent Changes (last 3 sessions)

1. **2026-04-22** — CLI `list` and `status` commands, consolidated `process.env` reads in embeddings through config layer, decomposed `lint.ts` into `lint-checks.ts` + orchestrator
2. **2026-04-21 (afternoon)** — Graph DPR fix (devicePixelRatio accumulation), magic number consolidation into `constants.ts`, `saveAnswerToWiki` frontmatter fix, added error boundaries to 7 pages
3. **2026-04-21 (morning)** — CLI tool (`src/cli.ts`) with ingest/query/lint subcommands, contextual error hints for `PageError` boundary, env consolidation in embeddings/llm

The last ~10 sessions have been hardening, polish, decomposition, and test backfill. No major new features since the onboarding wizard and dark mode (2026-04-19).

## Source Architecture

**27,350 total lines** across 115 source files:

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` (non-test) | 31 modules | ~6,400 | Core logic: ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log, fetch, etc. |
| `src/lib/__tests__/` | 30 test files | ~12,800 | Unit/integration tests |
| `src/app/` (pages + routes) | 31 files | ~3,700 | 13 pages, 18 API routes |
| `src/components/` | 22 components | ~2,900 | UI components |
| `src/hooks/` | 2 hooks | ~510 | useSettings, useStreamingQuery |
| `src/cli.ts` | 1 | 295 | CLI entry point |

**Largest non-test files** (>400 lines, candidates for further decomposition):
- `lint-checks.ts` (534) — 7 lint check implementations
- `graph/page.tsx` (488) — interactive graph with canvas rendering
- `embeddings.ts` (480) — vector store + embedding model management
- `query.ts` (476) — search, context building, LLM query
- `ingest.ts` (464) — URL/text processing, LLM page generation
- `lint-fix.ts` (458) — auto-fix implementations for each lint check type
- `fetch.ts` (403) — URL fetching, HTML stripping, SSRF protection

## Open Issues Summary
No open GitHub issues. The issue queue is empty.

## Gaps & Opportunities

### Relative to YOYO.md vision
1. **CLI not wired end-to-end** — `src/cli.ts` parses commands and prints help but the journal notes say it doesn't actually call the core library functions yet (the commands parse args but several may not execute)
2. **Image/asset handling** — llm-wiki.md discusses downloading images locally and having the LLM view referenced images; currently images are dropped during ingest
3. **Dataview-style dynamic queries** — llm-wiki.md mentions Dataview for querying frontmatter; no equivalent exists
4. **Obsidian plugin** — export exists but no real plugin
5. **E2E/integration tests** — no Playwright/Cypress tests; only unit/integration tests via vitest
6. **Docker/deployment story** — no Dockerfile, no deployment docs for self-hosting

### Relative to llm-wiki.md founding pattern
7. **Marp slide deck output** — the founding doc mentions Marp for slide decks from wiki content; not implemented
8. **Canvas/chart output formats** — query answers are always markdown/table; no chart or canvas output
9. **Schema co-evolution** — SCHEMA.md is loaded into ingest prompts but not into lint or query prompts
10. **Batch ingest workflow** — batch UI exists but there's no "batch ingest with less supervision" mode that auto-processes without preview

### Polish & quality
11. **4 remaining `process.env` reads bypass config** — `embeddings.ts` (2 reads), `wiki.ts` (2 reads for WIKI_DIR/RAW_DIR)
12. **17 files over 300 lines** — ongoing decomposition opportunity
13. **Status report is stale** — reports 964 tests but actual count is 1004; date says 2026-04-20
14. **No rate-limit/quota management** — LLM calls have retry but no budget tracking or user-facing usage display

## Bugs / Friction Found

1. **No bugs in build/lint/test** — all clean, zero warnings from eslint, zero type errors.
2. **Only 1 TODO/FIXME in codebase** — a comment in `fetch.ts:160` about IPv4-mapped IPv6, which is already handled (it's a documentation comment, not an action item).
3. **Test stderr noise** — expected error messages from negative test cases (invalid URLs, malformed JSON) print to stderr during `pnpm test`. Not a bug but slightly noisy; previously noted and partially addressed in journal.
4. **Graph page (488 lines)** — still the largest page component; the render logic was extracted to `graph-render.ts` but the React component itself is large with inline event handlers, state management, and layout. Could benefit from hook extraction.
5. **`GlobalSearch.tsx` (346 lines)** and **`WikiIndexClient.tsx` (343 lines)** — two largest components, both mixing data fetching, state management, and rendering in a single file.
