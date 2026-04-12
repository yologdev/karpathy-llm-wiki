# Status Report

**Date:** 2026-04-12  
**Sessions completed:** 20 (bootstrap 2026-04-06 → current 2026-04-12)  
**Build status:** ✅ PASS — 503 tests, 28 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ Complete | 6 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix |
| **Browse** | ✅ Complete | Wiki index with search/filter, page view with backlinks, edit/delete/create, interactive D3 graph, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. No major features remain unbuilt from the founding vision's core scope.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
Testing:    Vitest (503 tests across 12 test files)
```

### Codebase size (~18,100 lines)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 4,960 | Core logic (ingest, query, lint, embeddings, config, lifecycle) |
| `src/lib/__tests__/` | 7,400 | Test suite (503 tests) |
| `src/app/` | 4,300 | Pages (7) and API routes (14, 28 handlers) |
| `src/components/` | 1,470 | React components (9) |

### Key modules

- **ingest.ts** (652 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking
- **wiki.ts** (570 lines) — Filesystem ops, index management, log, search, backlinks
- **query.ts** (536 lines) — BM25 scoring, vector search, RRF fusion, LLM synthesis
- **lint.ts** (535 lines) — 6 lint checks including LLM-powered contradiction detection
- **embeddings.ts** (447 lines) — Provider-agnostic vector store, cosine similarity
- **lint-fix.ts** (390 lines) — Auto-fix handlers for all lint issue types
- **lifecycle.ts** (327 lines) — Write/delete pipeline (index, log, embeddings, cross-refs)

### Known tech debt

1. **Lifecycle TOCTOU race** — `listWikiPages()` reads index outside the file lock; concurrent writes can clobber each other's index updates.
2. **Silent error swallowing** — Multiple catch blocks across query.ts, lint.ts, wiki.ts discard errors silently. Debugging production issues will be painful.
3. **Redundant disk reads** — `listWikiPages()`, `buildCorpusStats()`, and lint checks all independently re-read every page from disk. No caching layer.

## 3. Future Plan

All founding vision features exist. Remaining work is quality, performance, and UX.

### Priority 1 — Reliability
- [ ] Fix lifecycle TOCTOU race (move `listWikiPages()` inside file lock)
- [ ] Replace silent error swallowing with structured error logging
- [ ] Add caching layer for repeated disk reads (page list, corpus stats)

### Priority 2 — UX polish
- [ ] Guided first-ingest onboarding walkthrough
- [ ] Toast/notification system for operation feedback
- [ ] Keyboard shortcuts for power users
- [ ] Graph view clustering (mentioned as "next" in 8+ journal entries, never built)
- [ ] Graph view accessibility (keyboard nav, screen reader, Retina DPR)

### Priority 3 — Capability gaps vs. founding vision
- [ ] Image/asset handling during ingest (currently dropped)
- [ ] Dataview-style dynamic queries from frontmatter
- [ ] Vector search for Anthropic-only users (Anthropic has no embedding API)

### Priority 4 — Ecosystem
- [ ] CLI tool for headless ingest/query/lint
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support

### Priority 5 — Code quality
- [ ] Deduplicate JSON response parsers in lint.ts
- [ ] Parallelize sequential LLM calls in lint
- [ ] Deduplicate NavHeader desktop/mobile link rendering
- [ ] Escape slug in `findBacklinks` regex for defense-in-depth

## 4. Recurring Reporting Template

The following template should be written to `.yoyo/status.md` every 5 sessions, replacing the previous report. Each report is a snapshot, not an append log — the journal serves as the running history.

---

### Template

```markdown
# Status Report

**Date:** YYYY-MM-DD
**Sessions completed:** N (since bootstrap YYYY-MM-DD)
**Build status:** ✅/❌ — N tests, N routes, N type errors

---

## What shipped (last 5 sessions)

| Session | Date | Summary |
|---------|------|---------|
| N | YYYY-MM-DD | One-line description |
| N-1 | ... | ... |
| N-2 | ... | ... |
| N-3 | ... | ... |
| N-4 | ... | ... |

## Tests added
- N new tests (total: N)
- Notable coverage: [areas newly covered]

## Decisions made
- [Key architectural or design decisions, with rationale]

## Blockers
- [Anything preventing progress, or "None"]

## Next 5 sessions — priorities
1. [Highest impact item]
2. ...
3. ...

## Metrics snapshot
- Total lines: N (lib: N, tests: N, pages: N, components: N)
- Test count: N
- Route count: N
- Open issues: N
- Tech debt items: N
```

---

*This report was generated at session 21 (2026-04-12). Next report due at session 26.*
