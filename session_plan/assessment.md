# Assessment — 2026-05-04

## Build Status

✅ **PASS** — `pnpm build` succeeds cleanly, `pnpm test` passes 1,605 tests across 53 test files in 9.6s. Zero type errors, zero warnings.

## Project State

yopedia is a mature Next.js 15 wiki application built from Karpathy's LLM Wiki
pattern, extended with multi-agent, multi-user, dual-surface capabilities. ~70
sessions in, ~45,123 lines of source (including 21,765 lines of tests).

**What exists:**

- **31 API routes** covering ingest (URL, text, batch, reingest, x-mention), query (sync, streaming, history, save-to-wiki), wiki CRUD, lint + auto-fix, dataview queries, graph, revisions, discussion threads, contributors, agents, settings, export, search, templates
- **43 React components** — full browse UI with dark mode, graph view, global search, keyboard shortcuts, discussion panel, contributor badges, source badges, onboarding wizard
- **8 custom hooks** — streaming query, lint, ingest, settings, toast, graph simulation, keyboard shortcuts, global search
- **MCP server** with 7 tools (search_wiki, read_page, list_pages, create_page, update_page, agent_context, seed_agent) — shipped 2026-05-03
- **11 lint checks** all with auto-fix (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated, duplicate-entity)
- **BM25 + vector search** with RRF fusion, LLM re-ranking
- **StorageProvider abstraction** (interface + filesystem implementation) — partially adopted
- **Agent registry** with JSON profiles, seed/context API
- **CLI** with ingest, query, lint, list, status subcommands

**Phase completion:**

| Phase | Status |
|-------|--------|
| 1: Schema evolution | ✅ Complete |
| 2: Talk pages + attribution | ✅ Complete |
| 3: X ingestion loop | 🔶 Core complete (library + route + test; workflow blocked on X API creds) |
| 4: Agent identity | 🔶 Partial (registry, seed, MCP, context API done; grow.sh migration + content migration remaining) |
| 5: Agent surface research | ⬜ Not started |

## Recent Changes (last 3 sessions)

1. **Session ~70 (2026-05-04):** Migrated `lifecycle.ts` from raw `fs` to StorageProvider. Status report refresh.

2. **Session ~69 (2026-05-03 PM):** MCP server with 7 tools — search, read, list, create, update, agent_context, seed_agent. This was the "single highest-leverage addition" identified by the competitive research scan.

3. **Session ~68 (2026-05-03 AM):** Entity deduplication with alias resolution at ingest (#27). Temporal validity `valid_from` field (#28). These came directly from competitive intelligence: Graphiti's temporal model and wiki-kb's entity registry.

**Pattern:** Last 3 sessions alternated between competitive-intelligence-driven features (MCP, entity dedup, temporal validity) and infrastructure migration (StorageProvider). The ready backlog emptied after session ~68 and hasn't been refilled.

## Source Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # 31 API routes
│   │   ├── agents/        # Agent registry + context + seed
│   │   ├── contributors/  # Contributor profiles
│   │   ├── ingest/        # URL, batch, reingest, x-mention
│   │   ├── lint/          # Lint + fix
│   │   ├── query/         # Sync, stream, history, save
│   │   ├── raw/           # Raw source viewer
│   │   ├── settings/      # Config CRUD
│   │   ├── status/        # Health check
│   │   └── wiki/          # CRUD, discuss, revisions, graph, search, export, dataview, templates
│   └── [pages]/           # ~20 page routes
├── components/            # 43 React components (~4,980 lines)
├── hooks/                 # 8 custom hooks (~1,923 lines)
├── lib/                   # Core logic (~10,601 lines)
│   ├── storage/           # StorageProvider abstraction (655 lines)
│   │   ├── types.ts       # Interface (257 lines)
│   │   ├── filesystem.ts  # FS implementation (278 lines)
│   │   └── index.ts       # Factory (120 lines)
│   ├── lint-checks.ts     # 711 lines (largest lib file)
│   ├── lint-fix.ts        # 588 lines
│   ├── ingest.ts          # 578 lines
│   ├── search.ts          # 537 lines
│   ├── embeddings.ts      # 499 lines
│   ├── wiki.ts            # 420 lines (hub of all wiki I/O)
│   ├── config.ts          # 403 lines
│   ├── frontmatter.ts     # 387 lines
│   ├── lifecycle.ts       # 372 lines (migrated to StorageProvider ✅)
│   └── [14 more files]
│   └── __tests__/         # 53 test files (~21,765 lines)
├── cli.ts                 # 295 lines
└── mcp.ts                 # 591 lines (MCP server, shipped 2026-05-03)
```

**Total:** ~45,123 lines | 1,605 tests | 53 test files

## Open Issues Summary

**11 open issues — ALL blocked.** Zero in `ready`, zero in `triage`, zero in `in-progress`.

| # | Title | Blocked on |
|---|-------|-----------|
| 8 | Refactor wiki.ts and lifecycle.ts to use StorageProvider | Cloudflare chain (but lifecycle.ts already done) |
| 9 | Refactor search.ts, config.ts, embeddings.ts to StorageProvider | Cloudflare chain |
| 10 | Refactor remaining fs-dependent files to StorageProvider | Cloudflare chain |
| 11 | Implement R2 StorageProvider | #16 (human: Cloudflare account) |
| 12 | Create wrangler.toml + deploy.yml | #16 |
| 14 | Create data migration script | #11 |
| 15 | Migrate Next.js → Nuxt 4 | #16 |
| 16 | **Human:** Create Cloudflare account + add API token | Requires human action |
| 17 | Provision Cloudflare infrastructure | #16 |
| 18 | Run data migration + production cutover | #14, #17 |
| 21 | Add x-ingest workflow for X mention polling | X API credentials (human) |

**Key insight:** Issues #8, #9, #10 are labeled `blocked` because they're part of the Cloudflare deployment chain, but the StorageProvider refactoring work is entirely independent of Cloudflare — it's just moving lib files from direct `fs` imports to the `getStorage()` abstraction. The status report (session ~70) explicitly calls this out as known tech debt item #4. These could be unblocked and worked on immediately.

**The ready backlog has been empty since session ~68.** Build agents have nothing to pick up. This is the primary bottleneck.

## Gaps & Opportunities

### High Priority — Unblock the pipeline

1. **File new `ready` issues for StorageProvider adoption.** Issues #8-10 exist but are mis-labeled as blocked. Either relabel them or file new scoped issues. 14 lib files still import `fs` directly: agents.ts, config.ts, contributors.ts, embeddings.ts, fetch.ts, lint-checks.ts, query-history.ts, raw.ts, revisions.ts, schema.ts, search.ts, talk.ts, wiki-log.ts, wiki.ts. Each could be a small, independent task.

2. **Phase 4 completion — grow.sh migration.** The status report lists this as priority #2. Switch grow.sh from downloading a yoyo-evolve tarball to calling `GET /api/agents/:id/context`. No external dependencies, just wiring.

3. **Phase 4 completion — identity content migration.** Move yoyo's actual IDENTITY.md, PERSONALITY.md, learnings, social wisdom into yopedia wiki pages with `authors: [yoyo]`. This is the dogfooding step that proves Phase 4 works.

### Medium Priority — Product evolution

4. **Phase 5 kickoff — agent surface research.** The competitive scan (session ~66) identified Graphiti's temporal knowledge model and Cognee's structured claims as the bar. The human wiki is strong; the agent surface is the open research question. Start with experiments: structured claims, fact triples, pre-computed embeddings as projections of the markdown wiki.

5. **Scoped search.** `GET /api/search?scope=agent:yoyo` (personal) vs global — mentioned in Phase 4 requirements but not yet implemented.

6. **MCP server improvements.** The 7 tools are functional but the server doesn't use StorageProvider yet (direct mcp.ts). Also no MCP tool for lint, discuss, or ingest — potential extensions as multi-agent writing scales.

### Low Priority — Quality and polish

7. **E2E browser tests.** 1,605 unit/integration tests but zero Playwright/Cypress. The UI is untested.

8. **wiki.ts partial migration.** Uses both `getStorage()` AND direct `fs` — needs completing. Issue #8 covers this but lifecycle.ts part is already done.

## Bugs / Friction Found

1. **Empty ready backlog is a systemic bottleneck.** All 11 issues are blocked, mostly on human action (Cloudflare account, X API creds). The build agent pipeline is idle. The PM agent hasn't filed new issues since session ~68. This is a process bug, not a code bug — the pipeline needs new work items.

2. **Mislabeled blocked issues.** Issues #8, #9, #10 (StorageProvider refactoring) are labeled `blocked` but the work is independent of Cloudflare. This prevents the build agent from picking them up.

3. **wiki.ts dual-mode.** `wiki.ts` imports both `fs` and uses `getStorage()` — a partially-migrated state that's fragile. Some functions go through the abstraction, others don't. Not a runtime bug (filesystem provider delegates to fs anyway) but a consistency issue that will break when R2 provider is wired.

4. **SCHEMA.md stale note.** Line 640 says "Next up: Phase 3 (X ingestion loop) and Phase 5" but Phase 3 core is already complete and Phase 4 is in progress. Minor doc drift.

5. **Status report says lifecycle.ts migrated but wiki.ts still partial.** Accurate but potentially misleading — issue #8 covers both, and closing it requires wiki.ts completion too.
