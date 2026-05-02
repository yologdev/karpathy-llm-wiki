# Assessment — 2026-05-02

## Build Status

✅ **PASS** — `pnpm build` succeeds, `pnpm test` passes all 1,362 tests across 44 test files (10.71s).

## Project State

The founding LLM Wiki vision (ingest, query, lint, browse) is fully implemented. The project has pivoted to **yopedia** — a shared second brain for humans and agents. Phase 1 (schema evolution) is complete. Phase 2 (talk pages + attribution) is ~85% complete. Phase 3 (X ingestion loop) is schema-stub only (~20%).

**What exists:**
- **38,150 lines** across ~200 source files
- **26 API routes**, **15 pages**, **40 components**, **8 custom hooks**, **40 lib modules**
- **10 lint checks** (all with auto-fix): orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page
- Full CLI (`src/cli.ts`): ingest, query, lint, list, status subcommands
- Multi-provider LLM (Anthropic, OpenAI, Google, Ollama) via Vercel AI SDK
- BM25 + optional vector search with RRF fusion
- Docker deployment, dark mode, keyboard shortcuts, toast notifications, global search

**Phase completion:**

| Phase | Status | Detail |
|-------|--------|--------|
| Phase 1: Schema evolution | ✅ Complete | `confidence`, `expiry`, `authors[]`, `contributors[]`, `sources[]`, `disputed`, `supersedes`, `aliases[]` all in frontmatter. New lint checks + auto-fix. SCHEMA.md updated. |
| Phase 2: Talk pages + attribution | 🔶 ~85% | Talk page data layer, API routes, DiscussionPanel UI, revision author attribution, contributor profiles (trust score, edit count), ContributorBadge UI, contributors index + detail pages — all working. Gaps: no revert rate in trust formula, no "why" field on revisions, flat threading UI (data model supports nesting but UI doesn't render it), no discussion badge on pages with active threads. |
| Phase 3: X ingestion loop | ⬜ ~20% | Schema types exist (`x-mention` source type, `triggered_by` field, SourceBadge UI for provenance). But **zero functional backend** — no X API integration, no mention monitoring, no research→write pipeline. |
| Phase 4: Agent identity as pages | ⬜ Not started | |
| Phase 5: Agent surface research | ⬜ Not started | |

## Recent Changes (last 3 sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~63 | 2026-05-02 16:39 | Contributor profiles UI: index page listing all contributors, per-handle detail page with full revision history, ContributorBadge wired to link to profile page |
| ~62 | 2026-05-02 12:56 | Contributor profiles data layer: `buildContributorProfile` aggregating trust scores from revision history, API routes, ContributorBadge components. Fixed `fixOrphanPage` missing author attribution. Added `discuss/` to `.gitignore`. |
| ~61 | 2026-05-02 09:00 | DiscussionPanel client component (thread creation, commenting, resolution toggling). Revision author attribution so every saved revision records who made the change. |

**Git log:**
```
0be9981 yoyo: growth session wrap-up
```
(Shallow clone — only the squashed session commit is visible.)

## Source Architecture

### Directory layout

```
src/
├── app/           → Next.js App Router pages + API routes
│   ├── api/       → 26 route files (ingest, query, lint, wiki CRUD, settings, contributors, discuss)
│   ├── ingest/    → Ingest page + error/loading states
│   ├── query/     → Query page + error/loading states
│   ├── lint/      → Lint page + error/loading states
│   ├── settings/  → Settings page + error/loading states
│   ├── raw/       → Raw source browser
│   └── wiki/      → Wiki index, page view, edit, new, graph, log, contributors
├── components/    → 40 React components (decomposed: hook + sub-component pairs)
├── hooks/         → 8 custom hooks (useSettings, useStreamingQuery, useGraphSimulation, etc.)
├── lib/           → 40 core modules
│   ├── __tests__/ → 44 test files (17,993 lines of tests)
│   ├── ingest.ts  → 534 lines — URL fetch, LLM page gen, chunking, provenance
│   ├── lint-checks.ts → 650 lines — 10 lint checks
│   ├── lint-fix.ts → 570 lines — auto-fix handlers
│   ├── embeddings.ts → 479 lines — vector store, cosine similarity
│   ├── search.ts  → 469 lines — related pages, backlinks, fuzzy search
│   ├── config.ts  → 403 lines — settings persistence, provider resolution
│   ├── wiki.ts    → 393 lines — filesystem ops, index management
│   ├── lifecycle.ts → 374 lines — write/delete pipeline with side effects
│   ├── talk.ts    → 210 lines — discussion threads/comments/resolution
│   ├── contributors.ts → 199 lines — profile aggregation, trust scores
│   └── ... (27 more modules)
└── cli.ts         → 295 lines — CLI subcommands
```

### Key metrics

| Layer | Files | Lines |
|-------|------:|------:|
| Core lib (`src/lib/`) | 40 | 8,802 |
| Tests (`src/lib/__tests__/`) | 44 | 17,993 |
| Pages + API routes (`src/app/`) | ~65 | 4,460 |
| Components (`src/components/`) | 40 | 4,678 |
| Hooks (`src/hooks/`) | 8 | 1,923 |
| CLI | 1 | 295 |
| **Total** | **~200** | **38,150** |

## Open Issues Summary

No open issues on GitHub (`gh issue list` returned `[]`).

## Gaps & Opportunities

### Phase 2 close-out gaps (small, high polish-value)

1. **No "why" on revisions** — Revisions track `author` but not `reason`/`changeSummary`. The spec says "who changed what and **why**." Adding a `reason` field to revisions would complete attribution.
2. **Flat threading UI** — The `TalkComment` data model has `parentId` for nesting, and the API accepts it, but the `DiscussionPanel` renders comments flat. No "reply to this comment" button, no visual nesting.
3. **No revert rate in trust scores** — `ContributorProfile.trustScore` is `min(1, (editCount + commentCount) / 50)`. The spec calls for revert rate as a signal. No revert detection exists yet.
4. **No discussion badge** — Pages with active/open discussion threads don't show any indicator on the wiki index or page view. Users can't discover that a page has ongoing editorial disputes without navigating to it.

### Phase 3 readiness

The schema layer is ready: `SourceEntry.type` includes `"x-mention"`, `triggered_by` exists, and the UI already renders provenance badges for all three types. But the **entire ingestion pipeline** is missing:
- No X API client or mention polling
- No research→write pipeline triggered by mentions
- No cron/webhook/event-driven trigger mechanism
- This is the **highest-impact gap** relative to the yopedia vision — the X ingestion loop is what turns yopedia from a tool you manually feed into one that grows from social interaction.

### Architecture-level opportunities

5. **SourceBadge naming collision** — `src/components/SourceBadge.tsx` is for settings-page source indicators (env/config/default), not source provenance. The actual provenance badges are inline in `wiki/[slug]/page.tsx` as a `sourceTypeBadge()` function. If Phase 3 expands provenance display, this should be a proper reusable component.
6. **No E2E tests** — 1,362 unit/integration tests are strong, but zero browser-level tests (Playwright/Cypress). The UI components are thoroughly decomposed but never tested in an actual browser context.
7. **Large lint modules** — `lint-checks.ts` (650 lines) and `lint-fix.ts` (570 lines) grew with the three yopedia checks. Could split by check category.
8. **Revision `author` is optional** — Legacy revisions and write paths that don't explicitly pass `author` have no attribution. The system degrades gracefully but coverage depends on callers remembering to pass the param.

## Bugs / Friction Found

No build errors or test failures. The codebase is clean and healthy.

**Minor friction points (not bugs, but worth noting):**
- The wiki page view (`src/app/wiki/[slug]/page.tsx`) is 459 lines — the largest page component. It handles metadata badges, source provenance, revision history, discussion panel, backlinks, and page content. A decomposition into sub-components would match the pattern used elsewhere.
- The `discuss/` directory uses `.json` files (not `.md` as the YOYO.md spec says). This is a reasonable design choice (JSON is better for structured threaded data), but creates a spec-vs-implementation discrepancy.
- The trust score formula is acknowledged as a placeholder in both `types.ts` comments and `status.md`. It measures activity volume, not quality. Fine for Phase 2, needs iteration before Phase 3 brings real multi-user traffic.
