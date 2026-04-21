# Assessment — 2026-04-21

## Build Status

**✅ PASS** — `pnpm build` succeeds (all 13 pages, 18 API routes), `pnpm lint` clean, `pnpm test` passes **996 tests across 30 test files** in 7.4s. Zero type errors, zero warnings.

## Project State

The project is **feature-complete** against the founding vision. All four pillars from `llm-wiki.md` are implemented end-to-end:

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview before commit, raw source persistence, YAML frontmatter |
| **Query** | ✅ | BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming responses, citation extraction, table format mode, save-answer-to-wiki loop, query history |
| **Lint** | ✅ | 7 checks (orphan, stale-index, empty, missing-cross-ref, contradiction, missing-concept-page, broken-link), configurable enable/disable, severity filtering, LLM-powered auto-fix for all |
| **Browse** | ✅ | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive force-directed graph with clustering, log viewer, raw source browser, global search, Obsidian export |

Supporting infrastructure:
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI with onboarding wizard for new users
- Dark mode with system preference detection + manual toggle
- CLI tool (`pnpm cli`) with ingest, query, lint subcommands
- Skip-navigation, ARIA landmarks, keyboard accessibility
- Mobile-responsive layouts
- SSRF protection, path traversal guards, streaming body size limits
- Contextual error hints in error boundaries

## Recent Changes (last 3 sessions)

1. **2026-04-21 03:29** — CLI tool (`src/cli.ts`) with ingest/query/lint subcommands, contextual error hints in `PageError` boundary, consolidated `process.env` reads in embeddings/llm into single-point-of-access functions.

2. **2026-04-20 14:00** — Accessibility: skip-nav links, ARIA landmarks, focus management across app. Fixed flaky revisions test (timestamp collisions). Silenced expected ENOENT warnings in test output.

3. **2026-04-20 03:36** — Mobile-responsive layouts across 6 pages (query, lint, settings, wiki index, ingest, wiki page). SCHEMA.md refresh with missing lint checks documented.

## Source Architecture

**~27,000 total lines** across 115 source files (14,000 source + 13,000 test).

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 30 | 6,300 | Core logic: ingest, query, lint, lint-fix, embeddings, config, lifecycle, wiki, search, bm25, fetch, revisions, etc. |
| `src/lib/__tests__/` | 30 | 13,000 | Comprehensive test suites — every lib module has a dedicated test file |
| `src/app/` (pages) | 13 | 2,500 | Next.js pages: home, ingest, query, lint, settings, wiki CRUD, graph, log, raw browser |
| `src/app/api/` (routes) | 18 | 1,200 | REST API: ingest, query (regular + streaming), lint + fix, wiki CRUD, revisions, settings, graph, search, export, status |
| `src/components/` | 22 | 2,900 | UI components: nav, search, editors, forms, badges, alerts, etc. |
| `src/hooks/` | 2 | 510 | Custom hooks: useSettings, useStreamingQuery |

### Largest files (potential decomposition targets)

| File | Lines | Notes |
|------|------:|-------|
| `src/lib/lint.ts` | 625 | 7 check functions — could split per-check |
| `src/app/wiki/graph/page.tsx` | 485 | Canvas rendering + physics simulation inline |
| `src/lib/embeddings.ts` | 465 | Store management + embedding logic |
| `src/lib/ingest.ts` | 464 | Already well-structured |
| `src/lib/query.ts` | 462 | Already well-structured |
| `src/lib/lint-fix.ts` | 458 | 7 fix functions — mirrors lint.ts |
| `src/lib/fetch.ts` | 403 | Security + extraction — reasonable |
| `src/lib/wiki.ts` | 372 | Core CRUD — stable |

## Open Issues Summary

**No open GitHub issues.** The issue queue is empty.

## Gaps & Opportunities

### Relative to `llm-wiki.md` founding vision

1. **Image/asset handling during ingest** — The vision mentions downloading images locally and having the LLM reference them. Currently images are dropped during HTML→markdown conversion.

2. **Marp slide deck output** — The vision mentions generating presentations from wiki content. Not implemented.

3. **Schema co-evolution** — The vision describes the schema as something "you and the LLM co-evolve over time." SCHEMA.md exists and is loaded into prompts, but there's no UI for editing it or LLM-assisted schema refinement.

4. **Canvas/chart output formats** — The vision mentions answers as charts (matplotlib), canvas, or comparison tables. Table format exists but no visual chart output.

### Relative to YOYO.md roadmap

1. **Obsidian plugin** — Export exists but no real plugin.
2. **E2E/integration tests** — No Playwright or Cypress tests.
3. **Docker deployment** — No containerization.
4. **Dataview-style dynamic queries** — YAML frontmatter exists but no dynamic query/table views from it.

### Improvement opportunities (from code review)

1. **Graph canvas DPR bug** — `ctx.scale(dpr, dpr)` accumulates on resize because the transform isn't reset first. Each window resize doubles the scale factor, causing progressively blurry/broken rendering.

2. **`saveAnswerToWiki` doesn't write YAML frontmatter** — Saved query answers lack the metadata (created, updated, tags) that ingested pages have, causing inconsistency in the wiki index and filtering.

3. **Missing error boundaries** — `/wiki/graph`, `/wiki/new`, and `/lint` lack route-level error.tsx files. Errors fall through to the global boundary, losing contextual navigation.

4. **Magic numbers scattered across lib modules** — `maxOutputTokens: 4096` is duplicated in `llm.ts`, graph height `560` duplicated in graph page, lint constants inline in `lint.ts`, query thresholds inline in `query.ts`. Should consolidate into `constants.ts`.

5. **Graph palette reads OS preference, not app theme** — `getColorPalette()` checks `prefers-color-scheme` media query instead of the `.dark`/`.light` class the app actually manages, causing mismatched theming.

6. **CLI has no `bin` entry** — Can only run via `pnpm cli` (needs `tsx`), not installable globally. Minor since CLI was just added.

7. **O(n²) graph simulation** — No Barnes-Hut optimization or node limit. Will lag on large wikis (hundreds of nodes).

8. **O(n²) cross-ref lint check** — Every page checked against every other page with regex. Same scaling concern.

## Bugs / Friction Found

### Confirmed bugs

1. **Graph canvas DPR scale accumulation on resize** — `ctx.scale(dpr, dpr)` called without `ctx.setTransform(1,0,0,1,0,0)` first. Breaks graph rendering after any window resize. (`src/app/wiki/graph/page.tsx:345-346`)

2. **Graph palette ignores app theme setting** — Uses `window.matchMedia("prefers-color-scheme")` instead of checking `.dark` class on `<html>`. Graph renders wrong colors when user manually overrides OS theme. (`src/lib/graph-render.ts:64-68`)

3. **Saved query answers missing frontmatter** — `saveAnswerToWiki` writes raw markdown without YAML frontmatter, unlike `ingest()`. Causes filtering/sorting gaps in wiki index. (`src/lib/query.ts:428-461`)

### Minor issues

4. **CLI `lint --fix` exits 0 even when fixes fail** — `process.exit(1)` is skipped in the `--fix` path when `failed > 0`. (`src/cli.ts:183-186`)

5. **`extractSummary` splits on abbreviations** — Regex `/[.!?]\s/` breaks on "Dr. Smith" and similar. (`src/lib/ingest.ts:83`)

6. **Empty catch blocks in components** — `BatchIngestForm.tsx`, `GlobalSearch.tsx`, `QueryResultPanel.tsx` silently swallow errors, making debugging harder.

7. **Duplicated `maxOutputTokens` constant** — Hardcoded `4096` appears in two places in `llm.ts` (lines 279, 324).
