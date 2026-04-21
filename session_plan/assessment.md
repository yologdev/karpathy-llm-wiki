# Assessment — 2026-04-21

## Build Status
✅ **All green** — `pnpm build` compiles with zero warnings/errors, `pnpm lint` passes clean, `pnpm test` passes 964 tests across 28 test files in ~7.6s. No `any` types in production code.

## Project State
A mature, fully-functional LLM Wiki web application implementing all four founding vision pillars:

**Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview before commit, raw source persistence, cross-reference discovery and automatic backlinking.

**Query** — Hybrid BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history persistence.

**Lint** — 7 checks (orphan-page, stale-index, empty-page, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering.

**Browse** — Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive canvas graph with community clustering, log viewer, raw source browser, global full-text search, Obsidian export (zip).

**Infrastructure** — Multi-provider LLM (Anthropic, OpenAI, Google, Ollama via Vercel AI SDK), guided onboarding wizard for empty wikis, dark mode toggle, skip-navigation and ARIA landmarks, mobile-responsive layouts, SSRF protection, path traversal guards, file locking, atomic vector store writes.

## Recent Changes (last 3 sessions)
1. **2026-04-20 14:00** — Accessibility foundations: skip-nav links, ARIA landmarks, focus management for keyboard/screen-reader users. Silenced expected ENOENT test noise. Fixed flaky revisions test (timestamp collisions).
2. **2026-04-20 03:36** — Mobile responsive layouts across 6 pages (query, lint, settings, wiki index, ingest, wiki page). SCHEMA.md refresh with missing lint checks.
3. **2026-04-19 13:16** — Onboarding wizard (empty wiki detection + guided setup), dark mode toggle (localStorage + system preference), test suites for wiki-log, lock, and providers modules.

## Source Architecture
**120 source files, ~26,400 lines total:**

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 23 | ~6,300 | Core logic: ingest, query, lint, lint-fix, embeddings, config, lifecycle, revisions, bm25, search, wiki, wiki-log, lock, llm, fetch, frontmatter, links, citations, slugify, format, errors, graph, graph-render, export, providers, query-history, raw, constants, types |
| `src/lib/__tests__/` | 28 | ~12,800 | 964 tests covering all modules except constants.ts and types.ts (trivially static) |
| `src/app/` | 31 | ~3,670 | 13 pages + 18 API route files |
| `src/components/` | 20 | ~2,890 | Decomposed UI components |
| `src/hooks/` | 2 | ~510 | useSettings, useStreamingQuery |

**Largest non-test files:** lint.ts (625), graph page (485), embeddings.ts (475), ingest.ts (464), query.ts (462), lint-fix.ts (458), fetch.ts (403), wiki.ts (372), ingest page (363), config.ts (360), lifecycle.ts (355), GlobalSearch (346), WikiIndexClient (343).

## Open Issues Summary
No open issues on GitHub (`gh issue list` returned `[]`).

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision
The core pattern (raw sources → LLM-maintained wiki → query against it) is fully implemented. Remaining gaps from the vision document:

1. **Image/asset handling** — The vision mentions downloading images locally and having the LLM view referenced images. Currently images in source HTML are dropped during ingest. This is a meaningful gap for source documents that rely on figures/diagrams.

2. **CLI tool** — The vision describes CLI usage ("the LLM can shell out to it"). No CLI exists — all operations require the web UI. A headless `npx llm-wiki ingest <url>` / `query <question>` / `lint` would unlock scripting, CI pipelines, and integration with Obsidian/Codex/Claude Code agent workflows.

3. **Marp/presentation output** — The vision mentions answers in slide deck format (Marp). Query output is currently limited to markdown prose or tables.

4. **Dataview-style dynamic queries** — YAML frontmatter exists on pages but there's no way to query across it (e.g., "show all pages tagged 'AI' ingested after April 10").

### Relative to YOYO.md roadmap
Priority items from the status report's future plan:

1. **✅ Mobile responsive** — Done in session ~36.
2. **✅ Accessibility** — Skip-nav and focus management done in session ~37. But ARIA could go deeper (graph text alternatives, form validation announcements).
3. **Contextual error messages** — Error boundaries are generic (`PageError`). No distinction between "API key missing" vs "LLM rate limited" vs "filesystem error".
4. **CLI tool** — Listed as Priority 2. Not started.
5. **E2E/integration tests** — Listed as Priority 3. Not started. Could catch regression in the full page→API→lib stack.

### New opportunities
- **Streaming ingest progress** — Ingest can touch 10+ pages but the UI shows no progress until completion. A streaming response showing "Creating page... Updating cross-refs... Updating index..." would improve UX significantly.
- **Keyboard shortcuts** — Power users would benefit from Ctrl+K (search), Ctrl+I (ingest), etc. The GlobalSearch component already has a search dialog but no global hotkey.
- **Rate limiting / request queuing** — Multiple rapid ingests or lint runs can overwhelm LLM API quotas. No client-side or server-side throttling exists.
- **README polish** — The README.md could be more welcoming for first-time users: screenshots, a getting-started guide, deployment instructions (Vercel, Docker, etc.).

## Bugs / Friction Found

1. **No bugs detected** — Build, lint, and all 964 tests pass. No type errors, no warnings in build output.

2. **Test noise (minor)** — Several tests that exercise error-handling paths emit `console.error`/`console.warn` to stderr (expected ENOENT, API errors, malformed JSON). These are expected and correct behavior but make test output noisy. Session ~37 silenced some of these but ~10 stderr blocks remain visible.

3. **`process.env` reads bypassing config** — Known tech debt item #1 from status report. `embeddings.ts` (6 direct env reads), `llm.ts` (5 reads), and `config.ts` itself all access `process.env` directly. The config store (`loadConfig`/`saveConfig`) exists but not all readers use it. This means Settings UI changes for embedding providers may not take effect without also setting env vars — exactly the bug documented in learnings.md ("Retrofitting a config store doesn't retrofit its readers").

4. **26 `console.error`/`console.warn` calls in lib/** — Production logging is ad-hoc. No structured logging, no log levels, no way to suppress or redirect. Not a bug today but will become friction as the app matures.

5. **Graph page is still the largest component** (485 lines) — Despite extracting `graph-render.ts`, the page itself handles canvas interaction, theme detection, layout, and data fetching all in one file. It's the last mega-component.
