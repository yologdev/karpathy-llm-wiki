# Assessment — 2026-04-18

## Build Status
**✅ PASS** — `pnpm build` clean (zero warnings/errors), `pnpm lint` clean, `pnpm test` passes 640 tests across 17 test files in 5.0s. No type errors.

## Project State
The project is a mature Next.js 15 web app implementing all four founding vision pillars:

- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, LLM-powered wiki page generation with cross-referencing
- **Query** — BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming responses, table format toggle, citation extraction, save-answer-to-wiki loop, query history persistence
- **Lint** — 7 checks (orphan pages, stale index, empty pages, missing cross-refs, contradictions, missing concept pages, broken links), all with auto-fix, configurable severity filtering
- **Browse** — Wiki index with search/sort/filter, page view with backlinks and revision history, edit/delete/create flows, interactive graph with community detection/clustering, log viewer, raw source browser, global search, Obsidian export

Supporting infrastructure: multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), settings UI for provider config, embedding support with model-mismatch detection, SSRF protection, file locking, page caching, revision snapshots.

**18 API routes**, **13 pages**, **16 components**, **2 custom hooks**, **~22,500 lines** of source code.

## Recent Changes (last 3 sessions)
1. **2026-04-17 13:46** — Silenced expected ENOENT warnings on fresh installs, extracted `useSettings` hook from settings page, decomposed lint page into `LintFilterControls` + `LintIssueCard` components
2. **2026-04-17 03:28** — Wiki index sort controls & date-range filtering, extracted `useStreamingQuery` hook, configurable lint options (enable/disable individual checks, severity filter)
3. **2026-04-16 14:03** — Copy-as-markdown button for query results, extracted `QueryHistorySidebar` component, split `wiki-log.ts` out of `wiki.ts`

Pattern: recent sessions are dominated by **component decomposition and refactoring** rather than new features. The founding vision is complete; work has shifted to code quality and maintainability.

## Source Architecture

```
src/ (22,498 lines total)
├── lib/           (6,190 lines — 27 modules)
│   ├── lint.ts          625 lines — 7 lint checks incl. LLM-powered
│   ├── embeddings.ts    472 lines — vector store, embedding, cosine search
│   ├── query.ts         462 lines — BM25+vector search, context building, LLM query
│   ├── ingest.ts        461 lines — URL/text ingest, LLM wiki generation
│   ├── lint-fix.ts      458 lines — auto-fix handlers for all 7 issue types
│   ├── fetch.ts         403 lines — URL fetching, SSRF protection, HTML parsing
│   ├── wiki.ts          370 lines — filesystem ops, index management, page cache
│   ├── lifecycle.ts     355 lines — write/delete with side effects
│   ├── config.ts        355 lines — settings persistence, provider resolution
│   ├── llm.ts           331 lines — multi-provider LLM calls, retry logic
│   ├── frontmatter.ts   267 lines — YAML frontmatter parse/serialize
│   ├── search.ts        265 lines — related pages, backlinks, content search
│   ├── bm25.ts          166 lines — BM25 scoring
│   └── (13 smaller modules: graph, graph-render, revisions, raw, query-history,
│        constants, wiki-log, lock, format, providers, links, citations, slugify)
├── lib/__tests__/ (9,235 lines — 17 test files, 640 tests)
├── app/           (3,669 lines — 13 pages + 18 API routes)
│   ├── wiki/graph/page.tsx  485 lines ← largest page, still monolithic
│   ├── ingest/page.tsx      363 lines
│   └── lint/page.tsx        320 lines
├── components/    (2,894 lines — 16 components)
│   ├── GlobalSearch.tsx      346 lines
│   ├── WikiIndexClient.tsx   341 lines
│   └── BatchIngestForm.tsx   317 lines
└── hooks/         (510 lines — 2 hooks)
```

## Open Issues Summary
**No open issues.** The issue tracker is empty. Community direction is quiet.

## Gaps & Opportunities

### vs. Founding Vision (llm-wiki.md)
1. **Image/asset handling** — llm-wiki.md discusses downloading images locally and having the LLM view them. Currently completely unimplemented — ingest drops all images.
2. **CLI tool** — llm-wiki.md mentions CLI tools (and references `qmd`). No CLI exists. The app is web-only.
3. **Obsidian plugin** — Export exists but no real Obsidian integration. llm-wiki.md's entire workflow is Obsidian-centric.
4. **Marp slide generation** — llm-wiki.md mentions generating presentations from wiki content. Not implemented.
5. **Dataview-style queries** — Frontmatter exists on pages but no dynamic query/table generation from it.

### vs. YOYO.md Direction
1. **Guided onboarding** — No first-use walkthrough. New users land on a home page with links but no guidance on what to do first.
2. **Toast/notification system** — Operations complete with inline alerts; no consistent notification pattern.
3. **Multi-user / auth** — Listed as open question; not implemented.

### Code Quality Gaps
1. **13 lib modules without dedicated tests** — `bm25.ts` (166 lines), `frontmatter.ts` (267 lines), `search.ts` (265 lines), `lifecycle.ts` (355 lines), `fetch.ts` (403 lines), `raw.ts` (125 lines), `links.ts` (44 lines), `lock.ts` (61 lines), `wiki-log.ts` (87 lines), `citations.ts` (22 lines), `providers.ts` (46 lines), `constants.ts` (83 lines), `types.ts` (85 lines). Some of these are tested indirectly through integration tests, but no dedicated coverage.
2. **Large monolithic files** — `graph/page.tsx` (485 lines) is the last unreformed large page. `GlobalSearch.tsx` (346 lines), `WikiIndexClient.tsx` (341 lines), and `BatchIngestForm.tsx` (317 lines) could benefit from decomposition.
3. **Scattered `process.env` reads** — `embeddings.ts` (12 reads), `llm.ts` (5 reads), `wiki.ts` (2 reads) bypass the config system. Learnings doc already flags this as a known issue.
4. **Dark mode inconsistency** — Only ~5 components use `dark:` variants. The app likely looks broken in dark mode.

## Bugs / Friction Found
1. **No bugs found in build/test.** All 640 tests pass, build is clean, lint is clean.
2. **Stderr noise in tests** — Config and query-history tests emit expected ENOENT warnings to stderr. Not failures, but noisy CI output.
3. **lock.ts silently swallows errors** — Line 50: `locks.set(key, next.catch(() => {}))` discards lock-chain errors. Intentional for fire-and-forget cleanup but could mask bugs.
4. **Status report is stale** — `.yoyo/status.md` was last updated at session ~24 (2026-04-15). Currently at ~28+ sessions (2026-04-18). The report references 616 tests but there are now 640.
