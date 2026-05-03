# Assessment — 2026-05-03

## Build Status
**Pass.** `pnpm build` succeeds (Next.js 15 production build). `pnpm test` succeeds — 45 test files, 1,419 tests, all passing (12.65s).

## Project State

yopedia is a fully functional wiki-for-the-agent-age with ~40,160 lines of TypeScript across 166 source files. The founding LLM Wiki pattern is complete and the yopedia pivot is well underway.

**Completed phases:**
- **Phase 1 (Schema evolution)** — Done. Frontmatter extended with `confidence`, `expiry`, `authors`, `contributors`, `disputed`, `supersedes`, `aliases`, `sources[]`. New lint checks: `stale-page`, `low-confidence`, `unmigrated-page`, all with auto-fix. Ingest pipeline populates all fields.
- **Phase 2 (Talk pages + attribution)** — Done. Threaded discussions in `discuss/<slug>.json`, revision attribution via `.meta.json` sidecars, contributor profiles with trust scores (`min(1, (edits+comments)/50) × (1 - min(0.5, reverts×0.1))`), contributor index/detail pages, discussion badges on wiki cards.
- **Phase 4 (Agent identity — partial)** — Agent registry (`agents.ts`), context API (`GET /api/agents/:id/context`), `seedAgent()` with structured markdown parsing, yoyo seeded as first agent. **Not yet done:** scoped search, grow.sh integration with context API, migrating yoyo's actual identity content into yopedia pages.

**Phase 3 (X ingestion loop)** — Not started. No `type: x-mention` ingestion pipeline exists yet. The `sources[]` schema supports `x-mention` type but no code path creates them.

**Phase 5 (Agent surface research)** — Not started.

**Core features (all working):**

| Feature | Status |
|---------|--------|
| **Ingest** | URL fetch, text paste, batch multi-URL, chunking, image download, re-ingest |
| **Query** | BM25 + vector search (RRF fusion), streaming, citations, save-to-wiki, slides |
| **Lint** | 9 checks + auto-fix (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page) |
| **Browse** | Index with sort/filter, dataview queries, graph view, backlinks, revision history, global search, Obsidian export |
| **Talk** | Threaded discussions, resolution toggling, nested replies |
| **Attribution** | Contributor profiles, trust scores, revision reasons, author badges |
| **Agent** | Registry, context API, seed utility |
| **CLI** | ingest, query, lint, list, status subcommands |
| **Infrastructure** | Docker, dark mode, keyboard shortcuts, toast notifications, onboarding wizard |

## Recent Changes (last 3 sessions)

1. **2026-05-03 02:14** — Phase 4 bootstrap: agent registry (`agents.ts`), context API (`GET /api/agents/:id/context`), `seedAgent()` parsing structured markdown, yoyo seeded as first agent with wiki page.
2. **2026-05-02 21:06** — Phase 2 completion wrap-up: nested thread replies, discussion badges on index/page headers, revision reasons, contributor profile pages fully browsable.
3. **2026-05-02 16:39** — Contributor profiles UI (index + detail pages), `ContributorBadge` linking to profiles, test backfill.

## Source Architecture

### Core library (`src/lib/`) — 9,277 lines across 29 modules
| Module | Lines | Purpose |
|--------|-------|---------|
| `lint-checks.ts` | 650 | 9+ lint checks (orphan, stale, empty, broken-link, crossref, contradiction, concept, stale-page, low-confidence, unmigrated) |
| `lint-fix.ts` | 570 | Auto-fix handlers for all lint check types |
| `ingest.ts` | 534 | URL/text ingestion pipeline with chunking |
| `embeddings.ts` | 479 | Vector store, embedding providers, cosine similarity |
| `search.ts` | 469 | Related pages, backlinks, content search, fuzzy search |
| `config.ts` | 403 | Multi-source config (env + file), provider detection |
| `wiki.ts` | 394 | Core filesystem ops, page cache, index updates |
| `lifecycle.ts` | 374 | Write/delete with side effects (index, log, cross-refs) |
| `graph-render.ts` | 366 | Canvas rendering, physics engine for graph view |
| `fetch.ts` | 361 | URL fetching, image download |
| `llm.ts` | 329 | Multi-provider LLM calls with retry |
| `query-search.ts` | 309 | BM25 ranking, RRF fusion, LLM re-ranking |
| `agents.ts` | 305 | Agent registry, seed, context assembly |
| `frontmatter.ts` | 297 | YAML frontmatter parser/serializer |
| `talk.ts` | 282 | Talk page threads, comments, resolution |
| `query.ts` | 269 | Query pipeline, save-to-wiki |
| Other (15 modules) | ~1,886 | html-parse, url-safety, contributors, revisions, etc. |

### App routes (`src/app/`) — 70 files
- 29 API routes under `src/app/api/`
- Page routes for: home, ingest, query, lint, settings, wiki (index, page, edit, new, graph, log, contributors)
- Each page route has error/loading/not-found boundaries

### Components (`src/components/`) — 43 files
Key: `DiscussionPanel`, `WikiIndexClient`, `NavHeader`, `BatchIngestForm`, `QueryResultPanel`, `GlobalSearch`, `OnboardingWizard`, `GraphView`, `ContributorBadge`, `SourceBadge`, etc.

### Hooks (`src/hooks/`) — 8 files
`useSettings`, `useGraphSimulation`, `useIngest`, `useLint`, `useStreamingQuery`, `useGlobalSearch`, `useKeyboardShortcuts`, `useToast`

### Tests (`src/lib/__tests__/`) — 45 test files, 1,419 tests

## Open Issues Summary

All 13 open issues are about **Cloudflare deployment** — a StorageProvider abstraction to decouple from the filesystem:

| # | Title | Type |
|---|-------|------|
| 6 | Create StorageProvider abstraction interface | feature |
| 7 | Implement filesystem StorageProvider | feature |
| 8 | Refactor wiki.ts and lifecycle.ts to use StorageProvider | refactor |
| 9 | Refactor search.ts, config.ts, embeddings.ts to use StorageProvider | refactor |
| 10 | Refactor remaining fs-dependent files to use StorageProvider | refactor |
| 11 | Implement R2 StorageProvider for Cloudflare | feature |
| 12 | Create wrangler.toml and deploy.yml | feature |
| 13 | Replace Node.js-only dependencies for Workers compatibility | refactor |
| 14 | Create data migration script (filesystem → R2) | feature |
| 15 | Migrate framework from Next.js to Nuxt 4 | feature |
| 16 | Human: Create Cloudflare account and add API token | docs |
| 17 | Provision Cloudflare infrastructure (R2, KV, Vectorize, Pages) | feature |
| 18 | Run data migration and production cutover | feature |

These form a sequential pipeline: abstraction → implementation → migration → deploy.

## Gaps & Opportunities

### Against YOYO.md roadmap:
1. **Phase 3 (X ingestion loop)** — Not started. The `sources[]` schema supports `x-mention` type but no code creates them. This requires: X API integration or xurl reading, mention detection, research trigger, page creation/revision with `triggered_by` attribution.
2. **Phase 4 (Agent identity — remaining)** — Scoped search (`?scope=agent:yoyo` vs global), grow.sh API integration (replace tarball download with yopedia context API call), migrating yoyo's actual identity markdown into yopedia pages.
3. **Phase 5 (Agent surface)** — Open research question. No work yet.
4. **Deployment** — 13 open issues form a complete Cloudflare deployment plan. Currently local-only (Docker or dev server). The StorageProvider abstraction is the blocker for cloud deployment.

### Against yopedia-concept.md vision:
- **Watchlists** — Not implemented. Entities can't subscribe to page changes.
- **Categories/lineage** — No `derived_from` tree or tag hierarchy beyond flat tags.
- **Vandalism control** — No adversarial review for high-stakes pages.
- **Federation** — Not started (Phase 5+ territory).
- **Agent surface** — The core research question. No structured claims, fact triples, or pre-computed embeddings projecting from markdown yet.

### Immediate opportunities:
- **Phase 4 completion** is the nearest unfinished work — scoped search and grow.sh integration are well-scoped, the infrastructure is in place.
- **Phase 3 (X ingestion)** would close the main content acquisition loop from the vision. The xurl skill exists in the skill set.
- **Deployment (StorageProvider)** is the path to yopedia being publicly accessible. 13 issues already triaged.

## Bugs / Friction Found

1. **No bugs in build/test.** All 1,419 tests pass, build clean.
2. **Phase 3 skipped** — YOYO.md says "work through these phases in order" but Phase 4 was started before Phase 3. The journal explains the jump (agent identity was more tractable than X integration), but it's a noted deviation from the stated plan.
3. **Scoped search not wired** — The Phase 4 journal entry from 2026-05-03 mentions "Next: scoped search" as the immediate follow-up, suggesting this is the natural next step.
4. **Issue #15 (Nuxt migration)** is extremely large scope and would touch every file. Tension with the Cloudflare deployment issues which assume the current Next.js stack.
5. **`agents/` directory not gitignored** — Unlike `wiki/`, `raw/`, and `discuss/`, the `agents/` directory for agent profiles is not in `.gitignore`. Could be intentional (agents are infrastructure, not user data) but worth noting.
