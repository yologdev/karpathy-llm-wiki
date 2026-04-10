# Assessment — 2026-04-10

## Build Status

All green:
- `pnpm build` — ✅ passes (23 static pages, no warnings)
- `pnpm lint` — ✅ clean (no ESLint issues)
- `pnpm test` — ✅ 364 tests pass across 9 test files (2.78s)

## Project State

The project is a fully functional Next.js 15 web app implementing all four pillars from the founding vision (ingest, query, lint, browse). Total source: **13,471 lines** across 56 TypeScript/TSX files.

**Core operations — all implemented:**
- **Ingest** — URL fetching (Readability + linkedom), text paste, batch multi-URL, content chunking (12K chars/chunk), LLM wiki page generation, two-phase preview workflow (generate → review → commit), fallback without LLM key, YAML frontmatter, cross-reference backlink propagation
- **Query** — BM25 full-body scoring, optional vector search via RRF fusion, LLM reranking, streaming responses (with non-streaming fallback), cited answers with source pills, save-answer-to-wiki loop
- **Lint** — 5 checks (orphan-page, stale-index, empty-page, missing-crossref, LLM-powered contradiction detection), auto-fix for 4 of 5 issue types, per-issue fix buttons in UI
- **Browse** — Wiki index with search/tag filters, individual page view with markdown rendering, graph view (D3-style force simulation on Canvas), activity log, raw source browsing, edit flow, delete flow

**Infrastructure:**
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings persistence (JSON config file + API + UI) — provider/model/key configurable from browser
- Provider-agnostic embedding layer (OpenAI, Google, Ollama — not Anthropic)
- Unified write/delete lifecycle pipeline (`lifecycle.ts`) preventing parallel-path drift
- Obsidian export (zip with `[[wikilinks]]`)
- Mobile-responsive nav with hamburger menu
- Empty-state onboarding for new users
- Status badge showing LLM provider health

## Recent Changes (last 3 sessions)

From journal.md (all on 2026-04-10):

1. **16:42** — Batch ingest flow (multi-URL endpoint + progress UI), empty-state onboarding on home page, SCHEMA.md refresh
2. **12:55** — Lint auto-fix expansion (orphan, stale-index, empty-page), provider constants consolidation into `providers.ts`, UI bug sweep across settings/query/ingest
3. **09:01** — Settings config store (JSON persistence, API routes, full UI page), lint auto-fix for missing cross-references (LLM-powered page rewriting)

Git log shows a single squashed commit (`10a7ba6 yoyo: growth session wrap-up`) — the full history was compressed.

## Source Architecture

```
src/ (13,471 lines total)
├── lib/ (core logic — 7 modules + 9 test files)
│   ├── ingest.ts          636 lines  — URL fetch, chunking, LLM generation, preview
│   ├── query.ts           541 lines  — BM25, vector search, RRF, reranking, streaming
│   ├── wiki.ts            426 lines  — filesystem ops, index, log, cross-refs
│   ├── lint.ts            408 lines  — 5 checks + contradiction clustering
│   ├── config.ts          353 lines  — settings persistence, credential resolution
│   ├── lifecycle.ts       326 lines  — unified write/delete pipeline
│   ├── embeddings.ts      308 lines  — vector store, embedding, cosine search
│   ├── frontmatter.ts     267 lines  — YAML frontmatter parse/serialize
│   ├── llm.ts             182 lines  — callLLM/callLLMStream via Vercel AI SDK
│   ├── raw.ts             125 lines  — raw source CRUD
│   ├── types.ts            74 lines  — shared interfaces
│   ├── providers.ts        46 lines  — provider constants (client-safe)
│   ├── export.ts           27 lines  — Obsidian link conversion
│   ├── citations.ts        21 lines  — citation slug extraction
│   └── __tests__/        5,399 lines — 9 test suites, 364 tests
├── app/ (Next.js pages + API routes)
│   ├── page.tsx            95 lines  — home dashboard
│   ├── ingest/page.tsx    513 lines  — ingest form (text/URL/batch + preview)
│   ├── query/page.tsx     329 lines  — query with streaming + save-to-wiki
│   ├── lint/page.tsx      295 lines  — lint UI with per-issue fix buttons
│   ├── settings/page.tsx  544 lines  — provider/model/key config
│   ├── wiki/
│   │   ├── page.tsx        23 lines  — wiki index (delegates to WikiIndexClient)
│   │   ├── [slug]/page.tsx 118 lines — individual page view
│   │   ├── [slug]/edit/    44 lines  — page editor
│   │   ├── graph/page.tsx 252 lines  — force-directed graph
│   │   └── log/page.tsx    31 lines  — activity log
│   ├── raw/                174 lines — raw source index + detail
│   └── api/               (12 route files, ~850 lines total)
│       ├── ingest/         149 lines — single + batch ingest
│       ├── query/          155 lines — query + stream + save
│       ├── lint/           253 lines — lint + fix
│       ├── wiki/           251 lines — CRUD + graph + export
│       ├── raw/             34 lines — raw source read
│       ├── settings/       117 lines — config GET/PUT
│       └── status/           6 lines — health check
└── components/
    ├── NavHeader.tsx       203 lines — responsive nav with active detection
    ├── WikiIndexClient.tsx 235 lines — searchable/filterable wiki index
    ├── BatchIngestForm.tsx 317 lines — multi-URL ingest form
    ├── WikiEditor.tsx       96 lines — markdown editor
    ├── MarkdownRenderer.tsx 59 lines — wiki-link-aware markdown
    ├── StatusBadge.tsx      84 lines — provider status indicator
    └── DeletePageButton.tsx 55 lines — delete with confirmation
```

## Open Issues Summary

No open issues on GitHub (`gh issue list` returned `[]`).

## Gaps & Opportunities

Relative to the founding vision in `llm-wiki.md` and the direction in `YOYO.md`:

### High priority (functional gaps)
1. **No image/asset handling** — URL ingest drops all images. The founding vision mentions image support explicitly (download locally, LLM views them separately). SCHEMA.md lists this as known gap #1.
2. **No contradiction auto-fix** — Lint detects contradictions via LLM but can't fix them. The only lint check without auto-fix. SCHEMA.md known gap #3.
3. **Embedding config not wired** — `getEmbeddingModel()` only reads `EMBEDDING_MODEL` env var, ignoring the config file's `embeddingModel` field that the Settings UI stores. Users who configure embeddings via the browser settings page get no vector search. **Real bug.**
4. **No batch vector rebuild** — If a user switches embedding providers or starts using one after already ingesting content, there's no way to rebuild the full vector index. SCHEMA.md known gap #2.

### Medium priority (quality/UX gaps)
5. **SCHEMA.md ↔ code drift on lint checks** — SCHEMA says "orphan" = no inbound links, code checks for not-in-index. SCHEMA says "stale" = not updated recently, code checks for index-entry-without-file. The descriptions are aspirational, not actual. Violates SCHEMA.md's own co-evolution principle.
6. **Graph view hardcodes dark theme** — All canvas colors (`#0a0a0a` background, `#60a5fa` nodes, etc.) are hardcoded. Breaks in light mode / doesn't respect system preference.
7. **No "Fix All" in lint UI** — Users must click individual fix buttons one at a time. Tedious with many issues.
8. **No retry/rate-limiting in LLM calls** — Single failed call throws immediately. Transient API errors kill the operation.
9. **No concurrency safety** — Simultaneous ingests can corrupt `index.md` or `log.md`. SCHEMA.md known gap #5.

### Lower priority (nice-to-haves from vision)
10. **No Marp slide deck generation** — Mentioned in founding vision as a query output format.
11. **No Dataview-style frontmatter queries** — Founding vision mentions dynamic tables from YAML frontmatter.
12. **No web search for gap filling** — Founding vision's lint section suggests "data gaps that could be filled with a web search."
13. **Token counting is character-based** — Conservative but imprecise. SCHEMA.md known gap #4.
14. **Model resolution logic duplicated 3× in config.ts** — `getEffectiveProvider()`, `getEffectiveSettings()`, `getResolvedCredentials()` have nearly identical if/else chains.

## Bugs / Friction Found

1. **Embedding config disconnected (bug)** — `embeddingModel` saved in config JSON but `getEmbeddingModel()` never reads it. Settings UI creates a false sense of configuration. Users configuring via browser get no vector search.

2. **SCHEMA.md lint check descriptions wrong (documentation bug)** — "orphan" and "stale" descriptions in SCHEMA.md don't match actual code behavior. This matters because SCHEMA.md is loaded into LLM prompts at runtime — the LLM gets incorrect context about what checks exist.

3. **Graph view not theme-aware (UI bug)** — Canvas rendering uses hardcoded dark colors. Light mode users see a jarring dark rectangle.

4. **Multi-chunk merge is naive concatenation** — `wikiContent += "\n\n" + continuation` can produce redundant headings or inconsistent structure when long documents are chunked.

5. **`buildCorpusStats()` reads all pages from disk per query** — O(N) disk reads on every query. Fine at current scale but will degrade.

6. **Streaming sources via `X-Wiki-Sources` header** — Non-standard HTTP header that proxies may strip.

7. **No `!` non-null assertion safety** in `llm.ts` `getModel()` — `creds.model!` assertion masks a potential type gap in credential resolution.
