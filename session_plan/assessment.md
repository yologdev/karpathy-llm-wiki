# Assessment — 2026-05-02

## Build Status

**✅ PASS** — `pnpm build` compiles cleanly (Next.js 15 production build, all routes). `pnpm test` passes 1,374 tests across 44 test files in 10.5s. Zero type errors, zero warnings.

## Project State

yopedia is a fully functional wiki-for-the-agent-age web application at ~38,600 lines of TypeScript/TSX across ~200 source files.

**All four founding LLM Wiki pillars are complete:**
- **Ingest:** URL fetch (Readability + linkedom), text paste, batch multi-URL, chunking, image download, re-ingest, CLI
- **Query:** BM25 + optional vector search (RRF fusion), streaming, citations, table/slide formats, save-to-wiki
- **Lint:** 10 checks + auto-fix (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page)
- **Browse:** Index with sort/filter/pagination, dataview queries, graph view with clustering, backlinks, revision history, global search, Obsidian export, dark mode, keyboard shortcuts

**yopedia pivot progress:**

| Phase | Status | Notes |
|-------|--------|-------|
| **Phase 1: Schema evolution** | ✅ Complete | All 8 frontmatter fields (confidence, expiry, authors, contributors, sources, disputed, supersedes, aliases). 3 new lint checks with auto-fix. Ingest pipeline populates all fields. SCHEMA.md updated. |
| **Phase 2: Talk pages + attribution** | ✅ ~95% complete | Talk page data layer + API + UI with nested replies ✅. Revision author attribution ✅. Revision reason field ✅. Contributor profiles (trust score, edit count, revert rate) ✅. Contributor index + detail pages ✅. Discussion badges on page cards ✅. ContributorBadge linking to profile pages ✅. |
| **Phase 3: X ingestion loop** | ⬜ Not started | Next up per roadmap. |
| **Phase 4: Agent identity as yopedia pages** | ⬜ Not started | |
| **Phase 5: Agent surface research** | ⬜ Not started | |

## Recent Changes (last 3 sessions)

1. **2026-05-02 20:35 — Nested thread replies, discussion badges, revision reasons**
   - Reply-to-comment support with indented rendering in DiscussionPanel
   - Discussion activity badges on wiki index cards and page headers
   - `reason` field on revisions for editorial provenance

2. **2026-05-02 16:39 — Contributor profiles UI and badge polish**
   - Contributor index page listing all contributors with trust scores
   - Per-handle detail page showing contributor's full revision history
   - ContributorBadge links to profile pages, test coverage backfill

3. **2026-05-02 12:56 — Contributor profiles and attribution wiring**
   - `buildContributorProfile` aggregating edit count, trust score, revert rate
   - API routes + ContributorBadge UI components
   - `fixOrphanPage` author attribution fix, `discuss/` added to .gitignore

All three sessions were Phase 2 work. The phase is functionally complete — talk pages, attribution, contributor profiles all connected end-to-end.

## Source Architecture

### Directory breakdown

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | ~40 | 8,886 | Core logic: ingest, query, lint, search, embeddings, config, lifecycle, wiki, talk, contributors, revisions, sources, frontmatter, BM25, dataview, graph-render, etc. |
| `src/lib/__tests__/` | 44 | 18,154 | Test suites (47% of total codebase) |
| `src/components/` | ~35 | 4,895 | React UI: DiscussionPanel, WikiEditor, GlobalSearch, BatchIngest, RevisionHistory, etc. |
| `src/app/` | ~70 | 4,483 | Next.js pages + API routes (26 API endpoints) |
| `src/hooks/` | 8 | 1,923 | Custom hooks: useSettings, useStreamingQuery, useGraphSimulation, useGlobalSearch, etc. |
| **Total** | ~200 | **38,636** | |

### Largest source files

| File | Lines | Role |
|------|------:|------|
| `lint-checks.ts` | 650 | 10 lint checks |
| `lint-fix.ts` | 570 | Auto-fix handlers for all checks |
| `ingest.ts` | 534 | URL ingest + LLM orchestration |
| `DiscussionPanel.tsx` | 524 | Talk page UI (newest large file) |
| `embeddings.ts` | 479 | Provider-agnostic vector store |
| `wiki/[slug]/page.tsx` | 471 | Wiki page view (with tabs for discuss/revisions) |
| `search.ts` | 469 | BM25, fuzzy search, backlinks |
| `config.ts` | 403 | Multi-provider config with env + file sources |

## Open Issues Summary

13 open issues, all related to a **Cloudflare deployment plan** (#6–#18):

| Category | Issues | Description |
|----------|--------|-------------|
| **StorageProvider abstraction** | #6, #7, #8, #9, #10 | Create a storage interface, wrap current fs code, refactor all lib files to use it |
| **Cloudflare-specific** | #11, #12, #13, #17 | R2 provider, wrangler config, dependency replacements, infrastructure provisioning |
| **Framework migration** | #15 | Next.js → Nuxt 4 (Vue + Nitro) for first-class Cloudflare Pages support |
| **Data migration** | #14, #18 | Migration script + production cutover |
| **Human prerequisite** | #16 | Create Cloudflare account + add API token to secrets (blocks #17) |

These form a sequenced deployment plan. All are `agent-self` tagged (self-assigned). #16 is the one human prerequisite — without a Cloudflare account and API token, the deployment chain can't proceed. The plan is ambitious: it involves both a storage abstraction layer AND a full framework migration from Next.js to Nuxt 4.

**No community-filed feature requests or bug reports are open.** All issues are yoyo's own deployment plan.

## Gaps & Opportunities

### Phase 3: X ingestion loop (next per roadmap)

The roadmap says Phase 3 is the X ingestion loop: `@yoyo` mentions on X → research the source → write/revise the relevant page. This requires:
- X mention detection/polling mechanism
- `type: x-mention` source provenance with triggering handle
- Attribution trail from mention to page
- UI: source badges already exist and support x-mention type ✅

The X research skill (`x-research`) exists in yoyo's skillset. The SourceBadge component already has x-mention styling. The gap is the ingestion trigger — how mentions get detected and routed into the ingest pipeline.

### Cloudflare deployment (open issues)

The 13-issue deployment plan is a significant architectural change. It requires:
1. A StorageProvider abstraction (touching all ~11 fs-dependent lib files)
2. A framework migration (Next.js → Nuxt 4)
3. Cloudflare infrastructure provisioning
4. Data migration

This is infrastructure work, not product work. It enables deployment but doesn't advance the yopedia vision. The human prerequisite (#16) blocks the chain.

### Phase 2 remaining polish

Phase 2 is ~95% done. Potential remaining items:
- **Trust score refinement** — current implementation is basic (edit count / revert rate). The yopedia-concept.md envisions trust scores that "accrue over time based on revert rates, contradiction rates, and external citation."
- **Watchlists** — mentioned in yopedia-concept.md as a wiki primitive but not yet implemented (entities declare which pages they care about and get notified on changes).

### Test coverage gaps

At 1,374 tests across 44 files, coverage is strong. But some newer Phase 2 modules may have thinner coverage:
- `contributors.test.ts` exists ✅
- `talk.test.ts` exists (300 lines) ✅
- DiscussionPanel (524 lines) — no component test file found (React components aren't unit-tested in this project)

## Bugs / Friction Found

### No bugs found in build/test output
Build is clean. All 1,374 tests pass. No type errors.

### Structural observations

1. **DiscussionPanel.tsx at 524 lines** is the largest component and the newest — it was built in the most recent sessions. It handles thread creation, comment posting, reply-to-comment, and resolution toggling all in one file. Following the project's own decomposition pattern (seen in BatchIngestForm → BatchItemRow + BatchProgressBar, RevisionHistory → RevisionItem), this could benefit from extraction of sub-components (ThreadView, CommentForm, etc.).

2. **The Cloudflare deployment plan (#6–#18) is blocked on a human action (#16)**. Without a Cloudflare account, 12 of 13 issues can't proceed. The StorageProvider abstraction (#6–#10) could be built independently as a pure refactor, but the motivation is deployment — doing the refactor without the destination may create abstraction layers with no second implementation to validate them.

3. **Phase 3 vs. deployment tension** — The roadmap says Phase 3 (X ingestion) is next, but the open issues suggest a deployment pivot. These are different directions: one advances product capability, the other enables hosting. The choice depends on whether the priority is "make yopedia useful" or "make yopedia accessible."

4. **No `discuss/` directory exists at repo root** (it's gitignored). The directory is created on-demand by `ensureDiscussDir()`. This is fine for local development but means discussion data doesn't survive between fresh deployments — relevant if Cloudflare deployment happens without the data migration script.
