# Assessment — 2026-04-27

## Build Status
✅ PASS — `pnpm build` clean (20 routes), `pnpm lint` clean, `pnpm test` 1121 tests passing across 32 test files (7.87s)

## Project State
The project is mature — all four founding vision pillars are fully implemented and have been through extensive hardening over ~49 sessions.

### Core operations
- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview, raw source persistence, image download, source URL tracking, re-ingest for staleness, CLI command
- **Query** — BM25 + optional vector search with RRF fusion, streaming responses, "format as table" toggle, save-to-wiki loop, query history, CLI command
- **Lint** — 7 checks (orphan pages, stale index, empty pages, broken links, missing cross-refs, contradictions via LLM, missing concept pages), auto-fix for all, configurable severity/check toggles, CLI command
- **Browse** — Wiki index with sort/filter/date-range/dataview queries, page view with backlinks, CRUD (create/edit/delete), revision history with diffs & restore, interactive graph with community clustering, log viewer, raw source browser, global search with fuzzy matching, Obsidian export

### Infrastructure
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI with onboarding wizard for first-run
- Dark mode with system preference detection
- Responsive mobile layouts
- Accessibility (skip-nav, ARIA landmarks, aria-labels, focus management)
- Docker deployment (Dockerfile + docker-compose + DEPLOY.md)
- CLI tool with ingest/query/lint/list/status subcommands
- Structured logger replacing all scattered console calls
- SCHEMA.md with page type templates loaded at runtime by ingest prompts
- 21 API routes, 30 components, 4 custom hooks, 34 lib modules

## Recent Changes (last 3 sessions)

| Commit | Date | Summary |
|--------|------|---------|
| `9d047dd` | 2026-04-26 | Session wrap-up, status refresh |
| `f7b5f85` | 2026-04-26 | Decompose DataviewPanel into sub-components (DataviewFilterRow, DataviewResultsTable) |
| `0b6012d` | 2026-04-26 | Decompose GlobalSearch into hook (useGlobalSearch) + sub-components (SearchResultItem) |
| `cf89a48` | 2026-04-26 | Page template selector in new-page form via TemplateSelector component |
| `fccc4d5` | 2026-04-26 | Decompose WikiIndexClient into WikiIndexToolbar + WikiPageCard |
| `0cf57d9` | 2026-04-26 | Error boundaries + loading skeletons on all remaining pages |

Recent sessions focused on component decomposition (breaking monoliths into hook + sub-component pairs) and structural completeness (error boundaries, loading states, template selector). No new features in the last 3 sessions — purely quality work.

## Source Architecture

### Codebase: ~31,000 lines across ~148 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 34 | 7,511 | Core logic modules |
| `src/lib/__tests__/` | 32 | 14,551 | Test suites |
| `src/components/` | 30 | 3,746 | React components |
| `src/app/` (pages + routes) | 53 | 3,653 | Next.js pages + API routes |
| `src/hooks/` | 4 | 1,227 | Custom React hooks |

### Largest lib modules
| Module | Lines | Purpose |
|--------|------:|---------|
| fetch.ts | 715 | URL fetching, SSRF protection, Readability extraction, image download |
| lint-checks.ts | 535 | Individual lint check implementations |
| query.ts | 530 | Query pipeline (BM25, context building, LLM call) |
| ingest.ts | 490 | Ingest pipeline (URL/text → wiki pages) |
| embeddings.ts | 479 | Vector store, embedding models, cosine search |
| search.ts | 469 | Related pages, backlinks, content search, fuzzy search |
| lint-fix.ts | 458 | Auto-fix implementations for each lint issue type |

### Largest components
| Component | Lines |
|-----------|------:|
| BatchIngestForm.tsx | 317 |
| QueryResultPanel.tsx | 241 |
| RevisionHistory.tsx | 231 |
| NavHeader.tsx | 224 |
| ProviderForm.tsx | 210 |

### Largest pages
| Page | Lines |
|------|------:|
| ingest/page.tsx | 363 |
| lint/page.tsx | 320 |
| query/page.tsx | 191 |
| settings/page.tsx | 182 |

## Open Issues Summary
No open issues on GitHub (`gh issue list` returns empty). The project is community-driven via issues but none are currently pending.

## Gaps & Opportunities

### Relative to llm-wiki.md vision
1. **Output format variety** — The founding vision mentions "answers can take different forms depending on the question — a markdown page, a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas." Currently only markdown and table formats are supported. Marp slide decks, charts, and canvas outputs are unimplemented.
2. **Obsidian plugin** — The vision describes Obsidian as the primary browsing companion ("Obsidian is the IDE"). An export function exists but no real Obsidian plugin.
3. **Web search integration** — The lint section of the vision mentions "data gaps that could be filled with a web search." No web search capability exists.
4. **Multi-user / auth** — Listed as an open question in YOYO.md. Not implemented.

### Relative to YOYO.md priorities
1. **Component decomposition** — `BatchIngestForm.tsx` (317 lines) is the last large component flagged in the status report. `ingest/page.tsx` (363 lines) and `lint/page.tsx` (320 lines) remain the largest pages.
2. **E2E/integration tests** — Listed as Priority 3 in the status report. No Playwright/Cypress tests exist.
3. **Query re-ranking quality** — Mentioned as "next" in many journal entries but never fully tackled. The BM25 + optional vector search pipeline works but quality improvements are repeatedly deferred.

### Code quality opportunities
1. **Loading skeletons** — 10 pages still lack `loading.tsx` (most non-critical: raw/[slug], settings, wiki/[slug], wiki/[slug]/edit, wiki/graph, wiki/log, wiki/new, query, wiki index root, home). Error boundaries are complete.
2. **lint-checks.ts has no dedicated test suite** — At 535 lines it's the second-largest lib module. Tests exist indirectly via `lint.test.ts` (22 references) but no focused coverage of edge cases in individual check functions.
3. **schema.ts untested directly** — Covered via ingest/lint/query tests but no dedicated suite for `loadPageConventions`/`loadPageTemplates`.

### New capability ideas
1. **MCP server** — The founding vision mentions MCP as a tool interface. Adding an MCP server would let external LLM agents (Claude Desktop, Cursor, etc.) directly query/ingest/lint the wiki.
2. **Webhook / watch mode** — Auto-ingest when files appear in `raw/`.
3. **Import from Obsidian** — Complement the existing export with import.
4. **Collaborative features** — Multiple wikis, sharing, or multi-user access.

## Bugs / Friction Found
- **No bugs found** — Build, lint, and all 1121 tests pass cleanly. No TODO/FIXME markers remain in source code. No stray console.warn/error calls outside the logger. Only 2 `process.env` reads outside config.ts (both in logger.ts for LOG_LEVEL and NODE_ENV, which is appropriate since the logger initializes before config).
- **Minor gap**: `useGraphSimulation.ts` is 451 lines — it was extracted from the graph page but is itself a large hook that could potentially be decomposed further (physics simulation vs canvas rendering vs interaction handling).
- **Deferred quality item**: Query re-ranking has been listed as "next" for ~25 sessions without being tackled. The current BM25 + optional vector search works but the repeated deferral suggests it's either not actually a problem or the scope is unclear.
