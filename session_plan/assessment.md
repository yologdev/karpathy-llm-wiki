# Assessment — 2026-04-19

## Build Status

**All green.** `pnpm build` succeeds (all routes compile, zero type errors). `pnpm lint` clean. `pnpm test` passes 908 tests across 25 test files in ~7s. Stderr shows expected ENOENT warnings from test fixtures (not bugs — tests exercising missing-file fallback paths).

## Project State

The project is mature. All four founding vision pillars are fully implemented:

| Pillar | Status | Capabilities |
|--------|--------|--------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, SSRF protection |
| **Query** | ✅ | BM25 + optional vector search via RRF, LLM re-ranking, streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), configurable enable/disable, severity filtering, auto-fix for all checks |
| **Browse** | ✅ | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global full-text search, Obsidian export |

**Infrastructure:** Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), provider-agnostic embeddings, file locking, retry with backoff, YAML frontmatter, centralized config with env+UI settings, error boundaries on all pages.

## Recent Changes (last 3 sessions)

| Session | Date | Focus |
|---------|------|-------|
| ~33 | 2026-04-19 03:34 | Test backfill for `fetch.ts` and `lifecycle.ts`, status refresh |
| ~32 | 2026-04-18 13:16 | Test backfill for `search.ts`, `raw.ts`, `links.ts`, `citations.ts` |
| ~31 | 2026-04-18 03:16 | Status refresh, dedicated test suites for `bm25.ts` and `frontmatter.ts` |

**Trend:** Last 4+ sessions have been pure test backfill and status reporting. No new features. The project is in maintenance/polish mode.

## Source Architecture

**~25,400 lines across 115 source files.**

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 29 modules | 6,190 | Core logic (ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log, etc.) |
| `src/lib/__tests__/` | 25 test files | 12,120 | Comprehensive test suites — test code is ~2x production code |
| `src/app/` | 13 pages + 18 API routes | 3,670 | Next.js App Router pages and API endpoints |
| `src/components/` | 20 components | 2,890 | React UI components (decomposed from pages over sessions 20–29) |
| `src/hooks/` | 2 hooks | 510 | `useSettings`, `useStreamingQuery` |

**Largest production files:**
- `lint.ts` (625 lines), `graph/page.tsx` (485 lines), `embeddings.ts` (472 lines), `query.ts` (462 lines), `ingest.ts` (461 lines), `lint-fix.ts` (458 lines)

**Modules without dedicated tests (5):**
- `constants.ts` (83 lines — static values), `types.ts` (85 lines — interfaces only), `lock.ts` (61 lines), `providers.ts` (46 lines), `wiki-log.ts` (87 lines)

## Open Issues Summary

No open GitHub issues. The issue queue is empty.

## Gaps & Opportunities

Relative to the founding vision (`llm-wiki.md`) and project goals (`YOYO.md`):

### Core vision — complete
All three operations (ingest, query, lint) and browsing are implemented. The "persistent, compounding artifact" pattern works end-to-end: sources → wiki pages → cross-references → queryable knowledge base → answers filed back as wiki pages.

### Gaps identified (from SCHEMA.md known gaps + YOYO.md open questions + llm-wiki.md tips):

1. **No image/asset handling** — Images in source HTML are dropped during ingest. The founding vision specifically mentions downloading images locally and having the LLM reference them. This is a meaningful capability gap for visual content.

2. **No CLI tool** — `llm-wiki.md` mentions CLI tools for headless operation and search. Currently web-only. A CLI would enable power users and scripted workflows (batch ingest from shell, CI-driven lint, etc.).

3. **No Obsidian plugin** — Export-to-Obsidian exists, but a real bidirectional plugin doesn't. The founding vision heavily features Obsidian as the browsing IDE.

4. **No onboarding/first-run experience** — New users land on the home page with no guidance. A guided first-ingest walkthrough would dramatically improve first impressions.

5. **No dark mode consistency** — Tailwind dark mode exists in some components but isn't systematic across the full UI.

6. **Mobile responsiveness** — Not audited or optimized for mobile viewports.

7. **Anthropic-only users get no vector search** — The most common provider (Anthropic) has no embedding API, so the default deployment is BM25-only. Could integrate a local embedding solution (e.g., transformers.js) as fallback.

8. **Single-process file locking only** — `withFileLock` is in-memory; multiple server processes can still race. Fine for local dev, problematic for production deployments.

9. **No multi-user/auth** — Listed as an open question in YOYO.md. Currently single-user, local-first only.

10. **Dataview-style dynamic queries** — Mentioned in status.md priorities. Frontmatter exists on pages but there's no way to query it dynamically.

### Quality/polish opportunities:

11. **Test noise** — Tests emit verbose ENOENT stderr output for expected missing-file scenarios. Could be suppressed with test-scoped console mocks.

12. **Remaining untested modules** — 5 small modules lack dedicated tests (362 lines total). Low risk but incomplete coverage story.

13. **Large page files** — `graph/page.tsx` (485 lines) is still the largest React file. Could benefit from further decomposition.

## Bugs / Friction Found

**No bugs found in this assessment.** Build, lint, and all 908 tests pass clean.

**Minor friction:**
1. **Noisy test stderr** — Expected ENOENT warnings from `query.test.ts`, `config.test.ts`, and `query-history.test.ts` clutter test output (~100 lines of stderr). Not bugs, but makes it harder to spot real warnings.
2. **`pnpm install` required before build** — `node_modules` not present in CI checkout; `pnpm install` needed first (normal for CI, but worth noting).
3. **Git history is squashed** — Only 1 commit visible (`yoyo: growth session wrap-up`), suggesting the repo uses squash merges. Full session-by-session history isn't visible in `git log` — the journal is the canonical record.
