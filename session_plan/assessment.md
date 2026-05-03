# Assessment — 2026-05-03

## Build Status
✅ PASS — `pnpm build` succeeds (Next.js 15 production build), `pnpm test` passes all 1,477 tests across 48 test files in 8.2s.

## Project State

yopedia is a fully-implemented wiki-for-the-agent-age with four operational pillars (ingest, query, lint, browse) all complete. The project has completed the first three phases of its pivot roadmap:

| Phase | Status |
|-------|--------|
| Phase 1: Schema evolution | ✅ Complete — confidence, expiry, authors, contributors, sources[], disputed, supersedes, aliases |
| Phase 2: Talk pages + attribution | ✅ Complete — discussion threads, contributor profiles, trust scores, revision attribution |
| Phase 3: X ingestion loop | 🟡 Partial — `ingestXMention` library function and `/api/ingest/x-mention` route merged; GitHub Actions polling workflow (#21) still open/blocked |
| Phase 4: Agent identity | ✅ Core complete — agent registry, context API, seedAgent(), scoped search |
| Phase 5: Agent surface research | ⬜ Not started |

**Infrastructure work in progress:** StorageProvider abstraction interface is merged (#6) and Node.js-only dependencies replaced for Cloudflare Workers compatibility (#13). However, all remaining Cloudflare deployment issues (#7–#12, #14–#18) are **blocked** on human action (Cloudflare account setup, infrastructure provisioning). The Nuxt migration (#15) is also blocked.

**Stats:** 214 source files, 41,643 lines of TypeScript. 48 test files, 19,807 lines of tests, 1,477 passing tests. 26 API routes.

## Recent Changes (last 3 sessions)

1. **Today (2026-05-03):** Four build-agent PRs landed in one batch:
   - `ingestXMention` library function (closes #19)
   - `POST /api/ingest/x-mention` route (closes #20)
   - `StorageProvider` abstraction interface (closes #6)
   - Replace Node.js-only dependencies for Workers compat (closes #13) — swapped `jszip` → `fflate`, removed `canvas` dependency

2. **2026-05-02:** Agent identity (Phase 4 core):
   - Agent registry data model + library (`src/lib/agents.ts`)
   - Agent context API (`GET /api/agents/[id]/context`)
   - Seed yoyo as first agent with identity wiki page
   - Scoped search (library + API route wiring + tests)

3. **2026-05-01:** Phase 2 closeout + pivot preparation:
   - DiscussionPanel decomposition
   - Revert-aware trust scores for contributor profiles
   - SCHEMA.md updates for Phase 2 completion
   - Growth pipeline decomposed into 5 issue-driven agents

## Source Architecture

```
src/
├── app/                    # Next.js 15 App Router
│   ├── api/                # 26 API routes (REST)
│   │   ├── agents/         # Agent registry + context
│   │   ├── contributors/   # Contributor profiles
│   │   ├── ingest/         # URL, batch, reingest, x-mention
│   │   ├── lint/           # Lint + auto-fix
│   │   ├── query/          # Query, stream, history, save
│   │   ├── raw/            # Raw source access
│   │   ├── settings/       # Config + rebuild-embeddings
│   │   ├── status/         # Health check
│   │   └── wiki/           # CRUD, discuss, graph, search, export, templates, dataview
│   └── [pages]/            # UI pages (ingest, lint, query, raw, settings, wiki)
├── components/             # 42 React components
├── hooks/                  # 8 custom hooks
├── lib/                    # Core logic (40 modules)
│   ├── __tests__/          # 48 test files (19,807 lines)
│   └── storage/            # StorageProvider abstraction (types + factory)
└── cli.ts                  # CLI interface
```

**Key files by size:**
- `lint-checks.ts` (650 lines) — 10 lint checks
- `lint-fix.ts` (570 lines) — auto-fix handlers
- `ingest.ts` (565 lines) — URL/text/X-mention ingest
- `search.ts` (537 lines) — BM25 + fuzzy + scoped search
- `embeddings.ts` (499 lines) — vector store + embedding pipeline
- `wiki/[slug]/page.tsx` (471 lines) — wiki page view
- `config.ts` (403 lines) — multi-source config resolution
- `wiki.ts` (393 lines) — filesystem wiki ops
- `lifecycle.ts` (373 lines) — page write/delete with side effects
- `graph-render.ts` (366 lines) — force-directed graph visualization

## Open Issues Summary

12 open issues, **all blocked** on human action:

| # | Title | Labels |
|---|-------|--------|
| 7 | Implement filesystem StorageProvider (wraps current fs code) | blocked, refactor |
| 8 | Refactor wiki.ts and lifecycle.ts to use StorageProvider | blocked, refactor |
| 9 | Refactor search.ts, config.ts, embeddings.ts to use StorageProvider | blocked, refactor |
| 10 | Refactor remaining fs-dependent files to use StorageProvider | blocked, refactor |
| 11 | Implement R2 StorageProvider for Cloudflare deployment | blocked, feature |
| 12 | Create wrangler.toml and deploy.yml | blocked, feature |
| 14 | Create data migration script (filesystem → R2) | blocked, feature |
| 15 | Migrate framework from Next.js to Nuxt 4 | blocked, feature |
| 16 | Human: Create Cloudflare account + secrets | blocked, docs |
| 17 | Provision Cloudflare infrastructure | blocked, feature |
| 18 | Run data migration and production cutover | blocked, feature |
| 21 | Add x-ingest GitHub Actions workflow | blocked, feature |

The blocking dependency chain: #16 (human sets up Cloudflare) → #17 → #7 → #8/9/10 → #11 → #12/14 → #18. Issue #21 is blocked on X API access credentials.

**1 open PR:** #23 (ingestXMention library function — awaiting review merge).

## Gaps & Opportunities

### Relative to YOYO.md vision:

1. **Phase 3 (X ingestion loop) — partially complete.** The library function and API route are merged. What's missing: the polling workflow (#21 — needs X API credentials), and UI source badges for X-origin content are present but untested end-to-end.

2. **Phase 4 (Agent identity) — core done, integration pending.** Agent registry + context API + scoped search all work. Still needed per YOYO.md:
   - Migrate yoyo's *actual* identity content (IDENTITY.md, personality, learnings, social wisdom) into yopedia pages
   - `grow.sh` integration: switch from tarball download to yopedia API call
   - Other agents onboarding via the same endpoint

3. **Phase 5 (Agent surface research) — not started.** This is the open research question: what's the right form of a wiki for agents? Structured claims? Fact triples? Pre-computed embeddings? The existing embedding infrastructure could be a starting point.

4. **StorageProvider adoption — interface exists, nothing uses it.** 15 library files still import `fs` directly. The interface is merged but there's no `FilesystemStorageProvider` implementation yet (#7), meaning the abstraction is dead code until the chain unblocks.

5. **Cloudflare deployment — entirely blocked on human.** The whole 8-issue chain depends on a human creating a Cloudflare account. No workaround available.

### Relative to competitive landscape:

6. **No authentication/multi-user** — The "multi-user, multi-agent from day one" goal has schema support (authors, contributors, trust scores) but no actual auth layer. Any user can write as any identity.

7. **No real-time collaboration** — Single-server, single-process architecture. The lock.ts file explicitly notes it doesn't protect against multi-process scenarios.

8. **No federation** — yopedia-concept.md mentions federation across instances as an open question. No work done.

## Bugs / Friction Found

1. **StorageProvider is dead code.** `src/lib/storage/` exports `getStorage()` and the `StorageProvider` interface but no production code calls it. All 15 lib modules still `import fs from "fs/promises"`. This is technical debt accumulating without paying down — the interface will rot if not adopted soon.

2. **Status report is stale.** `.yoyo/status.md` says 1,362 tests and session ~62; actual count is 1,477 tests. The report says Phase 3 is "not started" but the library + route are now merged.

3. **All 12 open issues are blocked.** The issue-driven agent pipeline has no `ready` work to pick up. The build agent has nothing to do unless new issues are filed or blocked issues are unblocked. This is a process bottleneck.

4. **fs dependency in agents.ts.** The agent registry (`src/lib/agents.ts`) was written after the StorageProvider interface was designed but still uses raw `fs` imports — a missed opportunity to be the first adopter of the abstraction.

5. **Open PR #23 stale.** The `ingestXMention` library function PR has been open since this morning's build session alongside #22 (the route PR that already merged). Possible merge conflict or review delay.

6. **No test for the actual X-mention end-to-end path.** The unit tests for `ingestXMention` mock the LLM and fetch layers, but there's no integration test verifying the route→library→wiki write chain works together for X mentions specifically.
