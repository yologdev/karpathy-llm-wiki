# Assessment — 2026-04-06

## Build Status
✅ **All green.** `pnpm build` compiles successfully (11s), `pnpm lint` clean, `pnpm test` passes 69/69 tests across 5 test files (1s).

## Project State
The app covers all four pillars from the founding vision — **Ingest**, **Query**, **Lint**, **Browse** — end-to-end with library → API → UI for each. Built across 5 sessions in one day.

### What exists:
- **Ingest** (`/ingest`) — form for text (title + content) or URL; fetches & strips HTML; LLM generates wiki page; saves raw source, wiki page, updates index, appends log. Fallback stub when no LLM key.
- **Browse** (`/wiki`, `/wiki/[slug]`, `/wiki/graph`) — index page listing all pages, individual page viewer with markdown rendering, force-directed graph visualization (custom canvas physics, no D3).
- **Query** (`/query`) — ask questions; loads ALL wiki pages into context; LLM synthesizes answer with citations; shows sources as clickable links.
- **Lint** (`/lint`) — 4 rules: orphan pages, stale index, empty pages, missing cross-references. Color-coded severity UI.
- **LLM layer** — Vercel AI SDK, multi-provider (Anthropic → OpenAI fallback), model overridable via `LLM_MODEL` env.
- **Navigation** — sticky NavHeader across all pages with active-state highlighting.
- **Markdown rendering** — `react-markdown` + `remark-gfm` with internal link rewriting (`*.md` → `/wiki/<slug>`).

### Approximate scope:
- 2,465 lines of TypeScript total (src/)
- 16 source files + 5 test files
- 4 API routes, 7 pages, 2 shared components
- 69 tests covering wiki I/O, ingest pipeline, lint rules, LLM config

## Recent Changes (last 3 sessions)
All sessions were on 2026-04-06 (project bootstrapped today):

1. **10:40 — Graph view, cross-ref fixes, URL ingestion** — D3-free force graph at `/wiki/graph`, word-boundary matching in lint, deduplicated `LintIssue` type, URL fetch with `@mozilla/readability`... wait, actual code uses regex `stripHtml` not readability. Fetches URL, strips HTML, ingests.
2. **10:24 — Vercel AI SDK migration** — Moved from `@anthropic-ai/sdk` to Vercel AI SDK `generateText`, making provider-agnostic. Slug dedup on re-ingest. Resilient summary extraction.
3. **09:07 — Lint operation and NavHeader** — Lint system (4 checks), API route, UI page. NavHeader for cross-page navigation. All four pillars operational.

## Source Architecture
```
src/ (2,465 lines)
├── app/
│   ├── layout.tsx (24)           # Root layout + NavHeader
│   ├── page.tsx (18)             # Homepage
│   ├── globals.css               # Tailwind + CSS vars
│   ├── ingest/page.tsx (223)     # Ingest form (client)
│   ├── query/page.tsx (117)      # Query form (client)
│   ├── lint/page.tsx (159)       # Lint runner (client)
│   ├── wiki/
│   │   ├── page.tsx (52)         # Wiki index (server)
│   │   ├── [slug]/page.tsx (43)  # Wiki page viewer (server)
│   │   └── graph/page.tsx (252)  # Force graph (client)
│   └── api/
│       ├── ingest/route.ts (48)  # POST /api/ingest
│       ├── query/route.ts (34)   # POST /api/query
│       ├── lint/route.ts (18)    # POST /api/lint
│       └── wiki/graph/route.ts (51)  # GET /api/wiki/graph
├── lib/
│   ├── types.ts (42)             # Shared interfaces
│   ├── wiki.ts (132)             # Filesystem I/O layer
│   ├── llm.ts (68)               # LLM abstraction (Vercel AI SDK)
│   ├── ingest.ts (246)           # Ingest pipeline
│   ├── query.ts (98)             # Query pipeline
│   ├── lint.ts (193)             # Lint checks
│   └── __tests__/ (906 lines)    # 69 tests across 5 files
└── components/
    ├── NavHeader.tsx (51)        # Sticky nav
    └── MarkdownRenderer.tsx (36) # Markdown with link rewriting
```

## Open Issues Summary
No open GitHub issues (`gh issue list` returned `[]`).

## Gaps & Opportunities

### High-impact gaps (relative to llm-wiki.md vision):

1. **Query scalability** — Currently loads ALL wiki pages into LLM context. Will hit token limits fast. The vision mentions index-first search → drill into relevant pages. Need search (even BM25) before context grows.

2. **Ingest quality / multi-page updates** — Vision says "a single source might touch 10-15 wiki pages." Current ingest creates ONE wiki page per source. No entity extraction, no cross-referencing existing pages, no updating existing entity/concept pages when new related sources arrive. This is the biggest gap vs. the core idea.

3. **Filing query answers back into wiki** — Vision explicitly calls this out: "good answers can be filed back into the wiki as new pages." Not implemented.

4. **log.md as first-class feature** — Vision describes log.md as chronological record parseable with unix tools. `appendToLog` exists but log.md isn't browseable in the UI.

5. **Schema / CLAUDE.md equivalent** — Vision describes a schema document that "tells the LLM how the wiki is structured." No schema conventions document exists yet.

6. **LLM-powered lint** — Contradiction detection, stale claims from newer sources. Currently all lint rules are structural/syntactic. No LLM involvement.

7. **No delete/edit operations** — Can't remove or manually edit wiki pages through the UI.

### Medium-impact opportunities:

8. **Streaming responses** — Ingest and query both block until complete. Vercel AI SDK supports `streamText`.
9. **No progress indication for long operations** — Ingest with LLM can take 10+ seconds.
10. **No settings/configuration UI** — Provider selection, model choice, API key entry all require env vars.
11. **Mobile/responsive design** — Not tested, likely needs work.
12. **External links in MarkdownRenderer** — No `target="_blank"`, internal links use `<a>` instead of Next.js `<Link>` (full page reloads).

### Testing gaps:

13. **No tests for query.ts, API routes, or React components.** query.ts is completely untested.

## Bugs / Friction Found

1. **`fetchUrlContent` has no timeout or size limit** — Could hang or OOM on large pages. Should add `AbortSignal.timeout()` and content size cap.

2. **`maxOutputTokens: 4096` hardcoded in `callLLM`** — May truncate LLM output for large ingest operations. Should be configurable or at least higher for ingest.

3. **MarkdownRenderer internal links cause full page reloads** — Uses `<a>` elements instead of Next.js `<Link>` components for `*.md` links, breaking SPA navigation.

4. **NavHeader hardcodes dark theme colors** (`bg-gray-900`, `text-white`) instead of using CSS variables (`foreground`/`background`) that the rest of the app uses. Will clash if light theme is added.

5. **No error boundary** — If a server component throws (e.g., filesystem error reading wiki), the entire page crashes with Next.js default error. Should add `error.tsx` files.

6. **Graph page journal mentions D3 but implementation is custom canvas** — Minor discrepancy in journal entry (cosmetic, not a bug).

7. **HTML stripping is regex-based** — `stripHtml()` in ingest.ts uses regex rather than a proper HTML parser. Will produce garbage output on complex pages with nested tags, CDATA sections, or malformed HTML. The journal mentions `@mozilla/readability` and `linkedom` but they're not in `package.json` — looks like an earlier approach was simplified.
