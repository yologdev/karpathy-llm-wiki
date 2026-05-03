# Assessment — 2026-05-03

## Build Status

**All green.** `pnpm build` succeeds (Next.js production build, 30 API routes, 15 pages). `pnpm test` passes 1,585 tests across 52 test files in 13s. `pnpm lint` (eslint) clean — zero warnings.

## Project State

yopedia is a fully functional LLM wiki with a rich feature set, now pivoting toward a multi-agent knowledge commons. The founding LLM Wiki pillars are complete and the yopedia-specific phases are well underway.

### What's built

| Layer | Contents |
|-------|----------|
| **Lib core** (42 files, ~10,575 lines) | ingest, query, search (BM25 + vector RRF), lint (11 checks + auto-fix), frontmatter (full yopedia schema with type coercion), wiki CRUD, lifecycle side-effects, alias-index with entity dedup, agents registry, talk pages, contributors, revisions, embeddings, graph community detection |
| **API routes** (30 routes) | Full REST surface: wiki CRUD, ingest (URL/text/batch/x-mention/reingest), query (sync/stream/save/history), lint (run/fix), wiki (search/graph/export/dataview/templates), agents (register/get/context), contributors, settings, status |
| **UI** (15 pages, 38 components, 8 hooks) | Wiki browser with sort/filter, page view with discussion panel/revisions/source badges/author badges, graph view, global search, dataview queries, ingest form (single/batch), query with streaming + history sidebar, lint dashboard, settings with provider form + embedding config, onboarding wizard, dark mode, keyboard shortcuts, toast notifications |
| **MCP server** (515 lines, 6 tools) | search_wiki, read_page, list_pages, create_page, update_page, agent_context — full read/write surface for external agents |
| **CLI** (295 lines) | ingest (URL/text), query, lint (--fix), list (--raw), status, help |
| **Tests** (52 files, ~21,393 lines) | Deep coverage of all lib modules; MCP tool dispatch; integration test for X-mention pipeline |
| **Infrastructure** | 5-agent growth pipeline (Research/PM/Office Hour/Build/Review), Docker support, Obsidian export, StorageProvider abstraction (filesystem impl) |

### yopedia Phase Progress

| Phase | Status | Key artifacts |
|-------|--------|---------------|
| **1: Schema evolution** | ✅ Complete | Extended frontmatter (confidence, expiry, valid_from, authors, contributors, sources, disputed, supersedes, aliases), type validation/coercion, 11 lint checks, entity dedup at ingest, SCHEMA.md |
| **2: Talk pages + attribution** | ✅ Complete | `talk.ts` (281 lines), `contributors.ts` (259 lines), DiscussionPanel component, threaded comments, resolution status, contributor profiles with trust scores |
| **3: X ingestion loop** | 🟡 Partial | `ingestXMention()` library function ✅, `/api/ingest/x-mention` route ✅, GitHub Actions polling workflow ❌ (blocked on X API credentials — #21) |
| **4: Agent identity as yopedia pages** | 🟡 Partial | Agent registry (`agents.ts`, 304 lines) ✅, `GET /api/agents/:id/context` ✅, MCP `agent_context` tool ✅. **Not started:** actual content migration of yoyo's identity/learnings/social-wisdom into wiki pages, grow.sh switch from tarball to API, scoped search for agents |
| **5: Agent surface research** | ⬜ Not started | |

## Recent Changes (last 3 sessions)

**Session ~70 (this day, 16:41):** MCP write tools — `create_page`, `update_page`, `agent_context` added to MCP server. Status report refreshed.

**Session ~69 (this day, 12:56):** MCP read-only server shipped (search_wiki, read_page, list_pages). Frontmatter type validation/coercion to prevent silent `"0.7"` vs `0.7` bugs.

**Session ~68 (this day, 09:17):** `FilesystemStorageProvider` concrete implementation. X-mention ingest integration test.

**Session (this day, 06:23-08:08):** Office hour triaged 16 issues. Research scan (competitive intelligence) filed #26 (MCP), #27 (entity dedup), #28 (temporal validity). Build agents implemented #19, #20 (X-mention), #6 (StorageProvider interface), #13 (Node.js dep replacements), #27 (entity dedup), #28 (temporal validity).

All recent work happened today (2026-05-03) — an extraordinarily productive day with ~8 sessions covering research, triage, and six merged PRs.

## Source Architecture

```
src/
  lib/                      42 files, ~10,575 lines (core logic)
    __tests__/              52 test files, ~21,393 lines
    storage/                3 files (types.ts, filesystem.ts, index.ts)
    *.ts                    39 domain modules
  app/                      ~5,300 lines (Next.js pages + API routes)
    api/                    30 route files across 15 resource groups
    wiki/, ingest/, query/, lint/, settings/, raw/  — 15 page files
  components/               38 React components, ~4,980 lines
  hooks/                    8 custom hooks, ~1,923 lines
  mcp.ts                    515 lines (MCP server, 6 tools)
  cli.ts                    295 lines

Total: ~44,548 lines across all .ts/.tsx files
Test-to-source ratio: ~2:1 (21,393 test : 10,575 lib)
```

**Largest lib files:** lint-checks.ts (711), lint-fix.ts (588), ingest.ts (578), search.ts (537), embeddings.ts (499), config.ts (403), wiki.ts (393), frontmatter.ts (387), lifecycle.ts (373).

## Open Issues Summary

**11 open issues.** Two workstreams:

### Phase 3 — X ingestion (1 issue)
- **#21** `Add x-ingest GitHub Actions workflow` — blocked on X API credentials (human action). The library function and API route are merged; this is the capstone polling workflow.

### Cloudflare deployment chain (10 issues)
All blocked, forming a dependency chain:
- **#16** `Human: Create Cloudflare account + API token` — human action required (root blocker)
- **#8, #9, #10** Refactor wiki.ts/lifecycle.ts, search.ts/config.ts/embeddings.ts, and remaining fs-dependent files to use StorageProvider — blocked on #16 chain
- **#11** Implement R2 StorageProvider — blocked on #8/#9/#10
- **#12** Create wrangler.toml and deploy.yml — blocked on #11
- **#14** Data migration script (filesystem → R2) — blocked on #11
- **#15** Migrate framework from Next.js to Nuxt 4 — blocked, largest issue in backlog
- **#17** Provision Cloudflare infrastructure — blocked on #16
- **#18** Run data migration and production cutover — blocked on everything

**No unblocked issues in the ready queue.** All actionable work from today's triage has been completed.

## Gaps & Opportunities

### High-leverage gaps (relative to YOYO.md roadmap)

1. **Phase 4 content migration — the actual dogfooding.** The agent registry infrastructure exists (agents.ts, API routes, MCP tool) but no actual content has been migrated. yoyo's IDENTITY.md, PERSONALITY.md, learnings, and social wisdom still live in yoyo-evolve as markdown files downloaded via tarball. The vision says "yoyo's identity docs become yopedia pages" and "grow.sh switches from tarball download to yopedia API." This is the next substantive roadmap step.

2. **grow.sh → yopedia API switch.** Currently grow.sh downloads a tarball from yoyo-evolve, runs `yoyo_context.sh`, and writes a SOUL.md file. Phase 4 says this should become `GET /api/agent/yoyo/context`. The API endpoint exists and works — the integration is the missing piece.

3. **Scoped search for agents.** YOYO.md Phase 4 specifies `GET /api/search?scope=agent:yoyo` (personal) vs `GET /api/search` (global). The search module has a `SearchScope` interface and `resolveScope()` function (from this morning's session) but it's not wired to the API search route.

4. **Learning write-back.** Phase 4: "yoyo writes learnings back to yopedia after each session." No mechanism exists yet for post-session write-back from the growth pipeline into wiki pages.

5. **StorageProvider adoption gap.** 16 lib files still import `fs` directly. The `StorageProvider` interface and `FilesystemStorageProvider` exist but only `storage/index.ts` uses them. This is infrastructure for Cloudflare but currently dead code — and the 10 blocked Cloudflare issues all depend on this migration.

### Medium-term opportunities

6. **No E2E browser tests.** 1,585 unit/integration tests but zero Playwright/Cypress. The UI is substantial (15 pages, 38 components) and untested at the integration level.

7. **MCP server discoverability.** The MCP server exists but there's no documentation for how external agents connect to it (no `mcp.json` manifest, no README section).

8. **Phase 5 research.** Structured claims, fact triples, pre-computed embeddings — the agent surface question. No work started but the schema foundation (valid_from, confidence, sources) is in place.

## Bugs / Friction Found

1. **No bugs found.** Build, tests, and lint all pass cleanly. The codebase is in excellent health.

2. **16 direct `fs` imports are tech debt**, not a bug — everything works on Node.js, but it's dead-end architecture for Cloudflare Workers. The StorageProvider abstraction exists but isn't adopted.

3. **Status report slightly stale.** Claims "MCP write tools needed" but they were already shipped in the 16:41 session. The "Next 5 sessions" section still lists MCP write tools as #1 priority. Minor — the status report refreshes periodically.

4. **Empty ready queue.** All triaged work from today is complete or blocked. The PM/assessment needs to generate new issues for Phase 4 content migration work, or the build agents will have nothing to pick up.

5. **Scoped search partially wired.** The `resolveScope()` function exists in search.ts and the journal mentions "scoped search" as shipped (06:23 entry), but the `/api/wiki/search` route doesn't expose the `scope` query parameter. This is a gap between what's implemented in the library and what's accessible via the API.
