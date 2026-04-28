# Assessment — 2026-04-28

## Build Status
✅ **PASS** — `pnpm build` succeeds with zero warnings/errors, `pnpm lint` clean, `pnpm test` passes all **1168 tests** across **34 test files** in 9s.

## Project State
The project is mature and feature-complete relative to the founding vision. All four pillars are fully implemented:

| Pillar | Web UI | API | CLI | Tests |
|--------|--------|-----|-----|-------|
| **Ingest** | ✅ URL + text + batch + preview + re-ingest | ✅ 4 routes | ✅ | ✅ |
| **Query** | ✅ Streaming + history + save-to-wiki + table format | ✅ 4 routes | ✅ | ✅ |
| **Lint** | ✅ 7 checks + auto-fix + suggestions + filter/sort | ✅ 2 routes | ✅ | ✅ |
| **Browse** | ✅ Index + graph + dataview + edit/delete/create + revisions + export + search | ✅ 11 routes | ✅ list/status | ✅ |

Supporting infrastructure: onboarding wizard, dark mode, global search (fuzzy), settings page, Docker deployment, structured logging, SCHEMA.md with page type templates, accessibility (skip-nav, aria-labels, focus management), mobile responsive layouts, revision history with diffs/restore.

## Recent Changes (last 3 sessions)
1. **2026-04-28 ~session 53** — Migrated all 10 API route files from `console.log`/`console.error` to structured logger; cleaned up stale re-export façade in `ingest.ts`.
2. **2026-04-27 ~session 52** — Added lint source suggestions (search queries for knowledge gaps), wired into LintIssueCard UI with collapsible panel; patched security vulns in next/vitest/postcss deps.
3. **2026-04-27 ~session 51** — Test suites for `lint-checks.ts` (400 lines) and `schema.ts` (235 lines); loading skeletons added to last 5 pages missing them.

**Pattern:** Recent sessions have been infrastructure/polish — structured logging, test backfill, loading skeletons, accessibility, component decomposition. No new user-facing features in the last ~10 sessions.

## Source Architecture
~31,900 lines across ~161 source files:

| Layer | Files | Lines | Key modules |
|-------|------:|------:|-------------|
| `src/lib/` | 34 | 7,488 | fetch (715), lint-checks (545), query (531), embeddings (479), search (469), lint-fix (458), ingest (453), config (403), wiki (390), lifecycle (358), llm (329) |
| `src/lib/__tests__/` | 34 | 15,244 | wiki (1924), ingest (1777), query (1239), fetch (1202), lint (1176), embeddings (1128) |
| `src/app/` pages | 13 | 1,757 | ingest (363), lint (320), query (191), settings (182) |
| `src/app/api/` routes | 21 | 1,524 | wiki/[slug]/revisions (181), wiki/[slug] (127), settings (118), wiki (110) |
| `src/components/` | 30 | 3,754 | BatchIngestForm (317), QueryResultPanel (241), RevisionHistory (231), NavHeader (224) |
| `src/hooks/` | 4 | 1,227 | useGraphSimulation (451), useSettings (321), useGlobalSearch (266), useStreamingQuery (189) |

**Dependencies:** 14 production deps (Next.js 15, Vercel AI SDK + 4 providers, Readability, linkedom, archiver, react-markdown, remark-gfm, Tailwind typography). 12 dev deps.

## Open Issues Summary
**Zero open issues** on GitHub (`gh issue list` returns `[]`). The project has no community-reported bugs or feature requests pending.

## Gaps & Opportunities

### Relative to llm-wiki.md vision
1. **No real end-to-end workflow testing** — All tests mock the LLM. No integration/E2E tests that exercise the actual user flow (ingest a URL → browse the result → query against it → lint the wiki). Playwright/Cypress not set up.
2. **CLI is parse-only** — `src/cli.ts` parses commands and prints help, but the actual `ingest`, `query`, `lint` subcommands shell out or import library functions that need the Next.js server context. The CLI test only tests argument parsing, not execution.
3. **No Obsidian plugin** — llm-wiki.md describes the Obsidian-as-IDE workflow as the primary UX. The project has an Obsidian-compatible export (`/api/wiki/export`) but no actual Obsidian plugin.
4. **No Marp/slide deck output** — llm-wiki.md mentions Marp slide generation from wiki content as a query output format. Not implemented.
5. **No canvas output format** — llm-wiki.md mentions canvas as a possible query answer format.
6. **No web search for gap-filling** — llm-wiki.md mentions lint suggesting web searches to fill data gaps. The lint suggestions recommend search queries as text but don't actually execute searches.
7. **Single-user only** — No auth, no multi-user, no per-user wiki isolation.

### Relative to YOYO.md direction
8. **Query re-ranking quality** — Flagged as "next" in the journal for the last ~15 sessions but never tackled. The LLM re-ranking prompt in `query.ts` could be improved.
9. **Component decomposition incomplete** — `BatchIngestForm.tsx` (317 lines) and `RevisionHistory.tsx` (231 lines) still monolithic per the status report.
10. **No component-level tests** — 34 test files all in `src/lib/__tests__/`. Zero tests for React components or hooks (useSettings, useStreamingQuery, etc.).

### New opportunities
11. **MCP (Model Context Protocol) server** — llm-wiki.md mentions qmd's MCP server. The wiki could expose itself as an MCP tool server so external LLM agents can query/ingest into it.
12. **Webhook/automation** — No way to trigger ingests programmatically from external systems (RSS, Slack, email).
13. **Multi-wiki support** — The data dir is fixed. Users can't maintain multiple separate wikis.

## Bugs / Friction Found
- **No bugs found** — Build, lint, and all 1168 tests pass cleanly. No warnings from `next build` or eslint.
- **Shallow git clone** — CI environment only has 1 commit (`110ce4f`), so `git log` is limited. Not a code issue but affects assessment visibility.
- **Stale "next" items in journal** — "Query re-ranking quality" has been listed as "next" for ~15 consecutive sessions without being tackled. This suggests either the task is unclear, low-priority relative to polish work, or needs decomposition.
- **CLI execution gap** — The CLI parses arguments correctly but actual command execution (calling `ingest()`, `query()`, etc.) may not work standalone outside the Next.js server process, since library code imports Next.js-specific modules. This is untested at the integration level.
- **CLI execution untested end-to-end** — `pnpm cli` script exists in package.json (`tsx src/cli.ts`) but no integration test exercises a full command cycle (e.g., `pnpm cli ingest <url>` actually writing files). The test suite only covers argument parsing.
