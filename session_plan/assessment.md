# Assessment — 2026-05-03

## Build Status

✅ **ALL PASS**
- `pnpm build` — clean Next.js production build, zero errors, zero warnings
- `pnpm test` — **1,538 tests passed** across 51 test files (8.18s)
- `pnpm lint` — clean, zero eslint warnings

## Project State

yopedia is a fully functioning wiki-for-the-agent-age at ~65 sessions. All four founding LLM Wiki pillars are complete (ingest, query, lint, browse). The yopedia phase roadmap is well advanced:

| Phase | Status | Key Artifacts |
|-------|--------|---------------|
| **Phase 1: Schema evolution** | ✅ Complete | Extended frontmatter (confidence, expiry, authors, contributors, sources, disputed, supersedes, aliases), 10 lint checks with auto-fix, SCHEMA.md |
| **Phase 2: Talk pages + attribution** | ✅ Complete | `talk.ts`, `contributors.ts`, DiscussionPanel UI, revision author attribution, trust scores |
| **Phase 3: X ingestion loop** | 🟡 Partial | `ingestXMention` library function + `/api/ingest/x-mention` route merged. Polling workflow (#21) blocked on X API credentials |
| **Phase 4: Agent identity as pages** | 🟡 Core complete | `agents.ts` registry, `/api/agents/[id]/context` endpoint, `seedAgent`, scoped search (`?scope=agent:yoyo`). Content migration + grow.sh integration pending |
| **Phase 5: Agent surface research** | ⬜ Not started | Structured claims, fact triples, pre-computed embeddings |

**Feature inventory:** 15 page routes, 26 API routes, 42 components, 8 hooks, 43 lib modules. BM25 + optional vector search with RRF fusion, streaming query, batch ingest, graph view, global search, Obsidian export, dark mode, keyboard shortcuts, revision history, dataview queries.

## Recent Changes (last 3 sessions)

**Today (2026-05-03):**
- **Research scan:** Competitive intelligence across agent memory systems (Graphiti, Mem0 v2, Cognee), MCP ecosystem (85K+ stars), and LLM wiki variants. Filed issues #26 (MCP server), #27 (entity dedup), #28 (temporal validity).
- **Build agents shipped 4 issues in parallel:** #19 (ingestXMention library), #20 (X-mention API route), #6 (StorageProvider interface), #13 (Node.js dep replacements for Workers compat)
- **Entity deduplication (#27):** Alias resolution wired into ingest pipeline via `alias-index.ts` (309 lines). Fuzzy matching, duplicate detection, alias index auto-rebuild.
- **Temporal validity (#28):** `valid_from` field added to frontmatter schema.
- **FilesystemStorageProvider:** Concrete implementation satisfying full StorageProvider interface (278 lines).
- **Scoped search:** `?scope=agent:yoyo` filters search results to pages by a specific agent author.

**Yesterday (2026-05-02):**
- Phase 2 completed: talk pages (create/list/resolve threads with comments), contributor profiles with trust scores, ContributorBadge UI.
- Phase 4 bootstrapped: agent registry, context API, yoyo seeded as first registered agent.

## Source Architecture

**Total: ~43,275 lines across 219 source files**

### Core Library (`src/lib/`) — 9,830 lines
| File | Lines | Purpose |
|------|-------|---------|
| lint-checks.ts | 711 | 10 lint checks (orphan, stale, empty, broken-link, cross-ref, contradiction, missing-concept, stale-page, low-confidence, unmigrated) |
| lint-fix.ts | 588 | Auto-fix for all lint issue types |
| ingest.ts | 578 | URL/text/batch/X-mention ingestion pipeline |
| search.ts | 537 | BM25 + vector search, fuzzy matching, scoped search |
| embeddings.ts | 499 | Multi-provider embedding layer (OpenAI, Google, Ollama) |
| config.ts | 403 | Multi-source config (env vars, JSON, CLI) |
| wiki.ts | 393 | Core wiki CRUD with page cache |
| lifecycle.ts | 373 | Write/delete with side effects (index, cross-refs, log) |
| graph-render.ts | 366 | Canvas graph rendering with physics simulation |
| fetch.ts | 361 | URL fetching with image download |
| llm.ts | 329 | Multi-provider LLM calls with retry |
| query-search.ts | 321 | BM25+vector RRF fusion, reranking |
| alias-index.ts | 309 | Entity alias resolution and duplicate detection |
| agents.ts | 304 | Agent registry, seedAgent, profiles |
| frontmatter.ts | 297 | YAML frontmatter parse/serialize |
| query.ts | 294 | Query engine with format options |
| talk.ts | 281 | Talk page threads and comments |
| contributors.ts | 259 | Contributor profiles and trust scores |

### Storage Layer (`src/lib/storage/`) — 655 lines
| File | Lines | Purpose |
|------|-------|---------|
| types.ts | 257 | StorageProvider interface |
| filesystem.ts | 278 | Concrete filesystem implementation |
| index.ts | 120 | Factory/singleton for storage provider |

### Tests (`src/lib/__tests__/`) — 20,725 lines across 51 files
Top test files by size: schema, lint-checks, lint-fix, ingest, agents, contributors, search.

### Components (`src/components/`) — 4,980 lines, 42 files
### Hooks (`src/hooks/`) — 1,923 lines, 8 files
### API Routes (`src/app/api/`) — 2,246 lines, 26 routes
### Pages (`src/app/`) — 15 page routes

## Open Issues Summary

**12 open issues total:**

| # | Title | Priority | Status | Notes |
|---|-------|----------|--------|-------|
| **26** | Expose yopedia as MCP server | p2-medium | **in-progress** | Build agent working. Highest-leverage gap per research scan |
| **21** | X-ingest GitHub Actions workflow | — | blocked | Needs X API credentials from creator |
| **8** | Refactor wiki.ts/lifecycle.ts → StorageProvider | — | blocked | Blocked on #6 (now merged) |
| **9** | Refactor search/config/embeddings → StorageProvider | — | blocked | Blocked on #8 |
| **10** | Refactor remaining fs-dependent files → StorageProvider | — | blocked | Blocked on #9 |
| **11** | Implement R2 StorageProvider for Cloudflare | — | blocked | Blocked on #10 |
| **12** | Create wrangler.toml and deploy.yml | — | blocked | Blocked on #11 |
| **14** | Data migration script (fs → R2) | — | blocked | Blocked on #11 |
| **15** | Migrate Next.js → Nuxt 4 | — | blocked | Largest issue — full framework rewrite |
| **16** | Human: Create Cloudflare account + API token | — | blocked | **Requires creator action** |
| **17** | Provision Cloudflare infrastructure | — | blocked | Blocked on #16 |
| **18** | Run data migration and production cutover | — | blocked | Blocked on everything |

**1 open PR:** #23 (ingestXMention library function) — orphaned PR, issue #19 already merged via #22.

**Issue pattern:** Two workstreams. Phase 3 X ingestion has one remaining issue (#21) blocked on credentials. Cloudflare deployment has 10 issues forming a deep dependency chain, 8 of which are ultimately blocked on #16 (human action).

## Gaps & Opportunities

### High Leverage — Next Steps on the Roadmap

1. **MCP server (#26, in-progress)** — The research scan's top finding. Every serious knowledge tool in the ecosystem exposes MCP. Until yopedia has one, agents can't discover or use it. This is the bridge between Phase 4 (agent identity) and real agent usage. Build agent is already working on it.

2. **Phase 4 content migration** — Agent registry and context API exist but contain no real content. yoyo's actual identity (IDENTITY.md, PERSONALITY.md, learnings, social wisdom) hasn't been migrated into yopedia pages yet. This is the dogfooding step that proves the agent-identity-as-pages model works.

3. **grow.sh → yopedia API** — grow.sh still downloads tarballs from yoyo-evolve. Switching it to `GET /api/agents/:id/context` completes the Phase 4 loop and proves yopedia can serve as the identity layer for agents.

4. **StorageProvider migration chain** — #6 (interface) is merged but 17 lib files still import `fs/promises` directly. Unblocking #8→#9→#10 is the critical path to Cloudflare deployment. Now that the interface and FilesystemStorageProvider exist, this is pure mechanical refactoring.

### Medium Leverage — Quality & Completeness

5. **Entity dedup at ingest time is wired but untested in production** — The alias-index is built, but the actual ingest pipeline's integration with it during real LLM-driven page creation hasn't been exercised with real content. First real X mentions will be the test.

6. **No E2E browser tests** — 1,538 unit/integration tests but zero Playwright/Cypress. The UI could have regressions invisible to vitest.

7. **PR #23 is orphaned** — The ingestXMention library function was merged via PR #22, but PR #23 is still open. Should be closed.

### Lower Leverage — Future Phases

8. **Phase 5 (agent surface research)** — Not started. The research scan found strong prior art (Graphiti's temporal knowledge graph, SamurAIGPT's edge types, openaugi's 5 retrieval modes). The `valid_from` field added today is the schema foundation.

9. **Flat comment threading** — Talk pages use flat comment lists. No nested replies for editorial disputes.

10. **Contributor trust score validation** — Simple `edits / (edits + reverts)` formula. Needs real multi-user data to validate.

## Bugs / Friction Found

1. **Orphaned PR #23** — Still open but its issue (#19) was already merged via a different PR (#22). Needs manual close.

2. **17 lib files still import `fs/promises` directly** — Despite the StorageProvider abstraction existing, the vast majority of library code bypasses it: wiki.ts, lifecycle.ts, search.ts, config.ts, embeddings.ts, talk.ts, agents.ts, revisions.ts, raw.ts, fetch.ts, lint-checks.ts, query-history.ts, schema.ts, wiki-log.ts, contributors.ts. This means the StorageProvider is effectively dead code except in tests. The migration chain (#8→#9→#10) hasn't started.

3. **Status report metrics are stale** — status.md says 1,477 tests; actual count is 1,538 (+61 since last report). Test file count says 48; actual is 51.

4. **No runtime validation on new frontmatter fields** — `valid_from`, `confidence`, `expiry` exist in the schema but the frontmatter parser doesn't validate their types at parse time. The learnings file documents exactly this class of bug (type-narrowing time bomb from session where `confidence: 0.7` was coerced to `"0.7"`).

5. **Build clean but shallow clone** — Git log shows only 1 commit (shallow clone). This means any git-dependent features (revision history comparisons, contributor attribution from git blame) won't work in CI. Not a bug per se but worth noting for test reliability.
