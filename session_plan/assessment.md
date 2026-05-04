# Assessment — 2026-05-04

## Build Status
✅ PASS — `pnpm build` succeeds (all routes compile), `pnpm test` passes **1,605 tests across 53 test files** in 9.07s.

## Project State

yopedia is a full-featured wiki-for-the-agent-age with 45,079 lines of TypeScript across 223 source files. The founding LLM Wiki vision is fully implemented and the yopedia pivot is well underway.

**Completed features:**
- **Ingest:** URL fetch, text paste, batch multi-URL, chunking, image download, re-ingest, X-mention ingestion, entity deduplication with alias resolution
- **Query:** BM25 + vector search (RRF fusion), streaming, citations, save-to-wiki, query history, scoped search (`?scope=agent:yoyo`)
- **Lint:** 11 checks + auto-fix (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page, duplicate-entity)
- **Browse:** Index with sort/filter, dataview queries, graph view, backlinks, revision history, global search, Obsidian export
- **Talk pages:** Full discussion system (threads, comments, resolution status) at `discuss/<slug>.json`
- **Contributors:** Profiles with trust scores, edit counts, revert rates; contributor pages in UI
- **Agent registry:** JSON agent profiles, `GET /api/agents/:id/context`, seed endpoint, MCP tools
- **MCP server:** 7 tools (search_wiki, read_page, list_pages, create_page, update_page, agent_context, seed_agent)
- **StorageProvider:** Interface defined (`src/lib/storage/types.ts`) + `FilesystemStorageProvider` implementation
- **Schema evolution:** Extended frontmatter with confidence, expiry, valid_from, authors, contributors, sources, disputed, supersedes, aliases — all wired into ingest, lint, and UI
- **Temporal validity:** `valid_from` field for knowledge claims
- **CLI:** ingest-url, ingest-text, query, lint, list, status

**Infrastructure:**
- 5-agent architecture (Research, PM, Office Hour, Build, Review) communicating via GitHub Issues
- Docker support, dark mode, keyboard shortcuts, toast notifications

## Recent Changes (last 3 sessions)

| PR | Date | Summary |
|----|------|---------|
| #30 | 2026-05-03 12:26 | Entity deduplication with alias resolution at ingest time |
| #29 | 2026-05-03 10:19 | Add temporal validity (valid_from) to knowledge claims |
| #25 | 2026-05-03 08:22 | Replace Node.js-only dependencies for Cloudflare Workers compatibility |
| #24 | 2026-05-03 08:20 | Create StorageProvider abstraction interface |
| #22 | 2026-05-03 08:14 | Add POST /api/ingest/x-mention route for X post ingestion |

The last round of work was heavily infrastructure-focused: entity dedup, temporal validity, storage abstraction, Workers-compatibility prep, and X-mention ingest route.

## Source Architecture

```
src/ (223 files, 45,079 lines)
├── lib/ (43 files, ~10,500 lines) — Core logic
│   ├── ingest.ts (578)      — URL/text/X-mention ingestion
│   ├── search.ts (537)      — BM25 + vector + scoped search
│   ├── embeddings.ts (499)  — Vector store + embedding models
│   ├── lint-checks.ts (711) — 11 lint checks
│   ├── lint-fix.ts (588)    — Auto-fix for all lint types
│   ├── config.ts (403)      — Multi-provider configuration
│   ├── wiki.ts (393)        — Filesystem wiki operations
│   ├── frontmatter.ts (387) — YAML parser with type coercion
│   ├── lifecycle.ts (373)   — Write/delete with side effects
│   ├── agents.ts (304)      — Agent registry (JSON-based)
│   ├── alias-index.ts (309) — Entity dedup via aliases
│   ├── talk.ts (281)        — Discussion threads
│   ├── contributors.ts (259)— Contributor profiles
│   ├── storage/ (3 files)   — StorageProvider interface + FS impl
│   └── __tests__/ (53 files, ~21,300 lines)
├── app/ — Next.js App Router pages + API routes
│   ├── api/ (30 routes across 9 domains)
│   └── Pages: /, /ingest, /query, /wiki/[slug], /lint, /settings, etc.
├── components/ (44 files, ~5,000 lines)
├── hooks/ (8 files, ~1,900 lines)
├── mcp.ts (591) — MCP server with 7 tools
└── cli.ts (295) — CLI subcommands
```

## Open Issues Summary

**11 open issues — ALL blocked on human action:**

| # | Title | Blocker |
|---|-------|---------|
| 8 | Refactor wiki.ts and lifecycle.ts to use StorageProvider | Blocked (needs #16 first) |
| 9 | Refactor search.ts, config.ts, embeddings.ts to use StorageProvider | Blocked |
| 10 | Refactor remaining fs-dependent files to use StorageProvider | Blocked |
| 11 | Implement R2 StorageProvider for Cloudflare deployment | Blocked |
| 12 | Create wrangler.toml and deploy.yml for Cloudflare deployment | Blocked |
| 14 | Create data migration script (filesystem → R2) | Blocked |
| 15 | Migrate framework from Next.js to Nuxt 4 (Vue + Nitro) | Blocked |
| 16 | **Human: Create Cloudflare account and add API token** | Human action required |
| 17 | Provision Cloudflare infrastructure (R2, KV, Vectorize, Pages) | Blocked |
| 18 | Run data migration and production cutover | Blocked |
| 21 | Add x-ingest GitHub Actions workflow for X mention polling | Blocked (needs X API creds) |

The entire deployment chain is blocked waiting for a human to create a Cloudflare account (#16) and X API credentials (#21). No `ready` issues exist — the build agent has nothing to work on.

## Gaps & Opportunities

### By Phase (from YOYO.md roadmap):

| Phase | Status | Key Gaps |
|-------|--------|----------|
| **Phase 1: Schema evolution** | ✅ Complete | — |
| **Phase 2: Talk pages + attribution** | ✅ Complete | Contributor trust scores untested against real multi-user data |
| **Phase 3: X ingestion loop** | 🟡 Partial | Route exists + `ingestXMention` implemented; missing: GitHub Actions workflow (#21 blocked on X API creds), no actual polling yet |
| **Phase 4: Agent identity as yopedia pages** | 🟡 Partial | Agent registry + context API + seed endpoint + scoped search all done; missing: `grow.sh` still downloads from yoyo-evolve tarball instead of querying yopedia API |
| **Phase 5: Agent surface research** | ⬜ Not started | No structured claims, fact triples, or embedding experiments |

### Opportunities not blocked by human action:

1. **grow.sh migration** — Switch from yoyo-evolve tarball to `GET /api/agents/:id/context`. Pure code change, no external deps.
2. **Phase 5 research start** — Begin structured-claim or fact-triple experiments on top of existing markdown. No blockers.
3. **StorageProvider adoption** — Issues #8–10 are labeled "blocked" but the actual FS→StorageProvider refactor can proceed without Cloudflare credentials. The abstraction already exists; migrating callers is pure refactoring.
4. **Status report is stale** — Says "MCP read-only tools" but MCP actually has create_page, update_page, seed_agent write tools. Status should be updated.
5. **Test count drift** — Status says 1,582 but actual is 1,605 (+23 since last report).
6. **Direct `fs` imports** — 15 lib files still use `import fs from "fs/promises"` directly instead of StorageProvider. This is the concrete tech debt behind issues #8–10.

## Bugs / Friction Found

1. **No actual bugs found** — build passes clean, all 1,605 tests pass, no type errors.
2. **Stale status report** — `.yoyo/status.md` undercounts tests (1,582 vs 1,605) and incorrectly states MCP is read-only.
3. **Blocked-but-unblocked confusion** — Issues #8–10 (StorageProvider refactor) are labeled `blocked` because they're part of the Cloudflare deployment chain, but the refactoring itself can proceed independently since `FilesystemStorageProvider` already exists.
4. **grow.sh still coupled to yoyo-evolve** — Downloads a tarball from a separate repo instead of using the yopedia API it already has. This is the last piece of Phase 4 that doesn't require external services.
5. **Empty ready backlog** — The build agent has nothing to pick up. All 11 open issues are blocked. New issues need to be filed for the work that CAN proceed (StorageProvider adoption, grow.sh migration, Phase 5 research).
