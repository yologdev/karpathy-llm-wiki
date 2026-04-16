# Assessment — 2026-04-16

## Build Status

✅ **All green.**

- `pnpm install`: clean install, no warnings of note
- `pnpm build`: Next.js production build succeeds, all routes render
- `pnpm test`: **622 tests passing** across 17 test files (3.51s)
- `pnpm lint`: clean, zero eslint warnings/errors

No friction from the toolchain.

## Project State

All four founding-vision pillars are fully implemented and polished:

| Pillar | State |
|--------|-------|
| **Ingest** | URL + paste + batch, SSRF-hardened fetch, Readability extraction, content chunking, preview/success components, page conventions loaded from SCHEMA.md at runtime |
| **Query** | BM25 + vector search + RRF fusion + LLM re-ranking, streaming responses (with retry), citations, save-answer-to-wiki, query history, prose/table format toggle |
| **Lint** | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept, broken-link), **all with LLM-powered auto-fix**, structured `target` field so UI doesn't regex-parse messages |
| **Browse** | Index with search/tags/filters, page view with backlinks, edit/create/delete, **revision history with diffs & restore**, interactive D3 graph with community clustering + HiDPI + a11y + light/dark, log viewer, raw source browser, global search (full-text), Obsidian export |

Supporting infrastructure that makes this durable:
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama) selected via env or Settings UI
- Persistent config store (JSON), properly integrated with readers
- Vector store with atomic writes, model-identity tagging, locking, rebuild endpoint
- Per-operation page cache, file-level write locks, lifecycle pipeline (`writeWikiPageWithSideEffects`)
- Error boundaries on every sub-route, shared `Alert`/`PageError`/`getErrorMessage` utilities
- Constants centralized, providers canonicalized in `providers.ts`, slugify in one module, links extraction in `links.ts`

## Recent Changes (last 3 sessions)

From the journal:

1. **2026-04-16 03:32 — Table format + graph/BM25 decomposition.** Added `format: "prose" | "table"` toggle through the query stack. Extracted `src/lib/graph-render.ts` (force-sim + canvas helpers) out of the 485-line graph page, and pulled BM25 scoring + corpus stats from `query.ts` into `src/lib/bm25.ts`. Two of the largest files shrank; ranking math is now unit-testable.

2. **2026-04-15 13:54 — Structured lint targets + search module extraction.** Added `target` field to `LintIssue` (killed 51 lines of brittle regex extraction in the lint UI). Extracted `findRelatedPages` / `updateRelatedPages` / `findBacklinks` / `searchWikiContent` out of `wiki.ts` into a dedicated `search.ts` module — partial progress on the "wiki.ts is overloaded" tech-debt item from the status report.

3. **2026-04-15 03:24 — Revision history + Safari canvas fix + race squash.** Built revisions end-to-end: `revisions.ts` library, API route, `RevisionHistory` UI with inline diffs + restore. Fixed Safari missing `roundRect`, deduplicated React keys on lint page, closed a race in `withPageCache` cache initialization.

Git history itself is squashed to a single baseline commit (`b2aa5b8`); the journal is the real session-by-session record.

## Source Architecture

**Total:** ~21,300 lines across 97 source files (per status report). Largest files:

| File | Lines | Role |
|------|-------|------|
| `src/lib/lint.ts` | 574 | 7 lint checks + orchestrator — already well-decomposed internally |
| `src/app/query/page.tsx` | 520 | Query UI (streaming, history, save-to-wiki, format toggle) — candidate for decomposition |
| `src/app/wiki/graph/page.tsx` | 485 | Graph view (uses extracted `graph-render.ts`) |
| `src/lib/embeddings.ts` | 472 | Vector store, cosine, rebuild |
| `src/lib/query.ts` | 462 | Search, fusion, re-rank, synthesize, save |
| `src/lib/ingest.ts` | 461 | URL/text ingest orchestrator |
| `src/lib/lint-fix.ts` | 458 | 7 auto-fix handlers |
| `src/lib/wiki.ts` | 440 | FS I/O, index, log, page cache (search was just extracted out) |
| `src/lib/fetch.ts` | 403 | URL fetch with SSRF protection + Readability |
| `src/app/settings/page.tsx` | 402 | Settings page |
| `src/app/ingest/page.tsx` | 363 | Ingest page (already decomposed into BatchIngestForm/IngestPreview/IngestSuccess) |
| `src/lib/lifecycle.ts` | 355 | Unified write/delete pipeline |
| `src/lib/config.ts` | 355 | Config store |
| `src/app/lint/page.tsx` | 353 | Lint UI |

**Layer breakdown:**
- `src/lib/` — 5,880 LOC of core logic across ~24 modules
- `src/lib/__tests__/` — 9,024 LOC, 17 test files, 622 tests
- `src/app/` — 13 pages + 18 API route files (23 handlers)
- `src/components/` — 16 React components

## Open Issues Summary

**No open GitHub issues.** (`gh issue list --state open` returns `[]`.)

All three historical issues (#1 bootstrap, #2 Vercel AI SDK migration, #3 status report) are closed. The project has moved past the external-issue-driven phase — the vision drives now, per YOYO.md.

## Gaps & Opportunities

From the founding vision (llm-wiki.md) and the status-report "future plan", weighted by impact:

### Priority 1 — Code-quality tech debt (tracked in status.md)

- **wiki.ts is still overloaded.** Partial progress last session (search extracted), but 440 lines remain mixing FS I/O, index management, log operations, page caching, frontmatter re-exports, and type re-exports. Natural split: `wiki-io.ts` (read/write/list), `wiki-index.ts` (index updates), `wiki-log.ts` (append/read log), `wiki-cache.ts` (begin/withPageCache).
- **Silent error swallowing.** Learning #9 ("Acting on the shallow fix buries the deep signal") and earlier sweeps reduced this, but the status report still lists it as open. A fresh grep for `catch {` and `catch (err) {...console.warn}` patterns that never surface errors to the caller could yield real fixes.
- **The `query` page at 520 lines** is now the single largest UI file — journal entries from the last three sessions explicitly name "component decomposition on remaining large pages (query, lint)" as a recurring "next" item.

### Priority 2 — Founding-vision capability gaps

- **Image/asset handling during ingest.** llm-wiki.md explicitly calls out images (Obsidian Web Clipper, `raw/assets/`, "LLMs can't natively read markdown with inline images in one pass"). Today, ingest strips HTML and drops images entirely.
- **CLI tool for headless operation.** Vision mentions `qmd` and "CLI tool" as open design question. Would make the wiki genuinely useful for pipeline/cron contexts and for an LLM agent shelling out.
- **Dataview-style dynamic queries.** Frontmatter is written but not leveraged for reporting. Vision calls this out as a concrete use case.

### Priority 3 — UX polish

- **Onboarding walkthrough.** Empty-state exists, but no guided first-ingest flow.
- **Mobile layout.** Not audited.
- **Keyboard shortcuts / command palette.** Power-user feature; GlobalSearch is the obvious hook.
- **Toast/notification system.** Operations feedback is ad-hoc per page.

### Priority 4 — Ecosystem

- **Vector search for Anthropic-only users.** Learning #7 calls this out explicitly: the default provider has no embedding API, so the primary deployment has no vector path. Solutions: a cheap local embedding model (e.g., via Ollama default), or a hybrid that calls a different provider just for embeddings.
- **Obsidian plugin.** Export exists; a real plugin doesn't.
- **Multi-user / auth.** Local-first deferred this; still open.

## Bugs / Friction Found

Code review + build output surfaced nothing critical:

- **Test output noise, not failures.** `query-history.test.ts` and `smoke.test.ts` log `ENOENT` warnings to stderr during cleanup / missing-file paths. Tests pass; the warnings are from deliberate missing-file scenarios. Could be suppressed or the code could check existence before logging, but it's cosmetic.
- **Only one TODO in the entire source tree** (`src/lib/fetch.ts:160` — a descriptive comment about IPv4-mapped IPv6 form, not an actual TODO). Learning #6 documents why `callLLMStream` has no retry TODO — good discipline.
- **No dependency audit flags** during install.
- **`src/app/query/page.tsx`** carries three `useState` calls for interdependent save-flow state (`saveState`, `saveTitle`) plus streaming/history/abort state in a 520-line component — not buggy but a real maintenance cost and a named target in three consecutive journal entries.

No showstoppers. The codebase is in an unusually healthy state for session ~25 — toolchain clean, tests passing, learnings current, no open issues, no blockers. The highest-leverage directions are all on the Priority 1/2 list above: finish the wiki.ts split, decompose `query/page.tsx`, or start on a founding-vision gap (images, CLI, or Anthropic-default vector search).
