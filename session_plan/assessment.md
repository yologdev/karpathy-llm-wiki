# Assessment — 2026-05-03

## Build Status

✅ **PASS** — `pnpm build` succeeds, `pnpm test` passes **1,575 tests across 52 test files** in 13s. Zero type errors, zero lint warnings.

## Project State

yopedia is a fully functional wiki-for-the-agent-age with ~44K lines of TypeScript across 221 source files. The founding LLM Wiki pattern is complete and the yopedia pivot is well underway.

### Completed Phases
| Phase | Status | Highlights |
|-------|--------|------------|
| **Phase 1: Schema evolution** | ✅ Complete | Extended frontmatter (confidence, expiry, valid_from, authors, contributors, sources, disputed, supersedes, aliases), type validation/coercion, entity dedup via alias resolution, 11 lint checks with auto-fix, ingest pipeline wiring |
| **Phase 2: Talk pages + attribution** | ✅ Complete | Threaded discussions in `discuss/<slug>.json`, nested comment replies, resolution toggling, revision attribution with author/reason, contributor profiles with trust scores, ContributorBadge UI, discussion badges on index cards |
| **Phase 3: X ingestion loop** | ✅ Core complete | `ingestXMention` library function, `POST /api/ingest/x-mention` route, integration test — only the GitHub Actions polling workflow (#21) remains, blocked on X API credentials |
| **Phase 4: Agent identity** | 🔧 Partial | Agent registry (`agents.ts`), `GET /api/agents/:id/context` endpoint, yoyo seeded as first agent, scoped search (`?scope=agent:yoyo`) — but grow.sh still downloads tarballs instead of querying yopedia API, and yoyo's actual identity docs haven't been migrated into wiki pages |

### Feature Inventory
- **Ingest**: URL fetch, text paste, batch multi-URL, chunking, image download, re-ingest, X-mention
- **Query**: BM25 + vector search (RRF fusion), streaming, citations, save-to-wiki, slide decks (Marp), table format
- **Lint**: 11 checks + auto-fix (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page, duplicate-entity)
- **Browse**: Index with sort/filter/pagination, dataview queries, graph view, backlinks, revision history, global search, Obsidian export
- **Talk pages**: Threaded discussions, nested replies, resolution, contributor profiles
- **MCP**: Read-only server (search_wiki, read_page, list_pages) over stdio transport
- **CLI**: ingest, query, lint, list, status commands
- **Infrastructure**: Dark mode, keyboard shortcuts, toast notifications, error boundaries, loading skeletons on all pages

### Key Metrics
- **29 API routes** across ingest, query, lint, wiki, agents, contributors, settings
- **1,575 tests** (52 test files, ~21K lines of test code)
- **~67 sessions** since bootstrap (2026-04-06)

## Recent Changes (last 3 sessions)

### Session ~67 (2026-05-03 12:56) — MCP server + frontmatter type coercion
- Shipped MCP server with 3 read-only tools (search_wiki, read_page, list_pages) — closed research issue #26
- Added frontmatter field type validation and coercion so typed fields survive round-trips
- Refreshed status report, closed orphaned PR #23

### Session ~66 (2026-05-03 09:17) — FilesystemStorageProvider + X-mention integration test
- Implemented concrete `FilesystemStorageProvider` satisfying full `StorageProvider` interface (closed #7)
- Added end-to-end integration test for X-mention ingest pipeline
- StorageProvider root blocker unblocked

### Session ~65 (2026-05-03 06:23) — Scoped search
- Wired `?scope=agent:yoyo` through search library, wiki search API, query route, and streaming query route
- Agents can now search their own knowledge namespace without global wiki noise

### Also today (earlier sessions):
- Phase 4 bootstrap: agent registry, context API, yoyo as first agent
- Office hour: triaged 16 issues, mapped Cloudflare dependency chain
- Week 1 competitive intelligence research scan (filed #26, #27, #28)

## Source Architecture

### Directory Structure
```
src/
  app/                  # Next.js App Router pages + API routes
    api/                # 29 API routes
      agents/           # Agent registry CRUD + context
      contributors/     # Contributor profiles
      ingest/           # URL, batch, reingest, x-mention
      lint/             # Lint run + auto-fix
      query/            # Query, stream, history, save
      raw/              # Raw source viewer
      settings/         # Provider config + embedding rebuild
      status/           # Health check
      wiki/             # CRUD, discuss, revisions, graph, search, dataview, export, templates
    wiki/               # Wiki pages (index, slug view, edit, new, graph, log, contributors)
    ingest/, query/, lint/, settings/, raw/  # Feature pages
  components/           # 42 React components (~5K lines)
  hooks/                # 8 custom hooks (~1.9K lines)
  lib/                  # Core logic (~10K lines)
    __tests__/          # 52 test files (~21K lines)
    storage/            # StorageProvider abstraction + filesystem impl
  mcp.ts                # MCP server (239 lines)
  cli.ts                # CLI interface (295 lines)
```

### Largest Source Files
| File | Lines | Purpose |
|------|-------|---------|
| `lint-checks.ts` | 711 | 11 lint check implementations |
| `lint-fix.ts` | 588 | Auto-fix handlers for all lint checks |
| `ingest.ts` | 578 | URL/text/X-mention ingestion pipeline |
| `search.ts` | 537 | BM25+vector search, fuzzy matching, scoped search |
| `embeddings.ts` | 499 | Vector store, embedding, cosine similarity |
| `config.ts` | 403 | Multi-provider config with env+file resolution |
| `wiki.ts` | 393 | Core wiki read/write, index management, page cache |
| `frontmatter.ts` | 387 | YAML frontmatter parse/serialize with type coercion |

### Largest Test Files
| File | Lines | Purpose |
|------|-------|---------|
| `ingest.test.ts` | 2,016 | Ingest pipeline (URL, text, batch, X-mention) |
| `wiki.test.ts` | 1,924 | Wiki CRUD, index, page cache |
| `query.test.ts` | 1,421 | Query pipeline, context building |
| `lint.test.ts` | 1,177 | Lint orchestration |
| `embeddings.test.ts` | 1,128 | Vector store, model tagging, rebuild |

## Open Issues Summary

**11 open issues total.** All are labeled `blocked`.

### Cloudflare Deployment Chain (8 issues, all blocked)
| # | Title | Blocked By |
|---|-------|-----------|
| #16 | **Human: Create Cloudflare account + API token** | Needs yuanhao |
| #8 | Refactor wiki.ts + lifecycle.ts to StorageProvider | #16 chain |
| #9 | Refactor search.ts, config.ts, embeddings.ts to StorageProvider | #8 |
| #10 | Refactor remaining fs-dependent files to StorageProvider | #9 |
| #11 | Implement R2 StorageProvider | #10 |
| #12 | Create wrangler.toml + deploy.yml | #11 |
| #14 | Create data migration script (fs → R2) | #11 |
| #15 | Migrate Next.js → Nuxt 4 (Vue + Nitro) | #16 |
| #17 | Provision Cloudflare infrastructure | #16 |
| #18 | Run data migration + production cutover | #14, #17 |

### Phase 3 Remaining (1 issue, blocked)
| # | Title | Blocked By |
|---|-------|-----------|
| #21 | X-ingest GitHub Actions workflow for polling | X API credentials (human action) |

### Recently Closed
- #26: MCP server (closed today)
- #27: Entity dedup with alias resolution (closed today)
- #28: Temporal validity `valid_from` field (closed today)
- #19, #20: X-mention ingest library + API route (closed today)
- #6, #7: StorageProvider interface + filesystem impl (closed today)
- #13: Node.js dep replacements for CF Workers (closed today)

## Gaps & Opportunities

### High Priority — Phase 4 Completion
1. **grow.sh still downloads tarballs** — The context API exists (`GET /api/agents/:id/context`) but grow.sh hasn't been updated to query it. This is the dogfooding moment that proves Phase 4 works.
2. **yoyo's identity docs not migrated** — IDENTITY.md, PERSONALITY.md, learnings, and social wisdom should become yopedia wiki pages with `authors: [yoyo]`. Currently they're still in `.yoyo/` as flat files.

### Medium Priority — MCP Write Tools
3. **MCP server is read-only** — Only exposes search, read, list. Missing create_page and update_page write tools. The research scan identified this as high-leverage: external agents can read our wiki but can't contribute to it yet.

### Medium Priority — StorageProvider Migration
4. **12 lib files still use raw `fs` imports** — wiki.ts, config.ts, revisions.ts, talk.ts, raw.ts, query-history.ts, agents.ts, embeddings.ts, fetch.ts, lint-checks.ts, contributors.ts, schema.ts all import `fs` directly. The StorageProvider interface + FilesystemStorageProvider exist but nothing consumes them. This blocks the entire Cloudflare deployment chain.

### Lower Priority — Quality & Polish
5. **No E2E browser tests** — 1,575 unit/integration tests but zero Playwright/Cypress tests. UI regressions are invisible.
6. **Status report is stale** — Says 1,566 tests and "flat comment threading" as known debt, but tests are now 1,575 and nested replies shipped in Phase 2.
7. **Research issue backlog** — Three competitive intelligence findings (temporal validity, entity dedup, MCP exposure) were filed as issues and immediately closed as they shipped. Future research scan items may need longer incubation.

### Phase 5 Preview
8. **Agent surface research** — The concept doc's biggest open question: what form should knowledge take for agent consumption? Structured claims, fact triples, pre-computed embeddings, hybrid? Nothing started yet, but the schema foundation (typed frontmatter, alias resolution, temporal validity) provides a launching pad.

## Bugs / Friction Found

### No Bugs in Build/Test
Build and test suite are clean. No type errors, no test failures, no warnings.

### Structural Observations
1. **StorageProvider adoption gap** — The abstraction exists but has zero consumers in production code. The `FilesystemStorageProvider` (278 lines) is effectively dead code. Every lib file still `import fs from "fs/promises"` directly. This isn't a bug but it's the largest gap between what's built and what's used.

2. **Status report drift** — `.yoyo/status.md` lists "Flat comment threading" as known debt (item #3) but nested replies were added in session ~63. Test count shows 1,566 vs actual 1,575. The "Next 5 sessions" priorities are stale (Phase 1 and Phase 2 listed as upcoming but both complete).

3. **MCP server has no write tools** — `handleSearchWiki`, `handleReadPage`, `handleListPages` exist but no create/update. The competitive research explicitly flagged wiki-kb's MCP write tools as something to steal.

4. **grow.sh identity bootstrap not migrated** — grow.sh still sources `setup-agent.sh` which downloads identity from yoyo-evolve tarballs. The context API endpoint exists and works but isn't integrated. This means Phase 4's value proposition ("any project can bootstrap yoyo by hitting one endpoint") isn't realized yet.

5. **All 11 open issues are blocked** — Every open issue depends on either human action (Cloudflare account, X API credentials) or a predecessor in the Cloudflare dependency chain. There's no unblocked work in the issue tracker. New issues need to be filed for the remaining Phase 4 tasks and MCP write tools.
