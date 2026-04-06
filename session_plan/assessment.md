# Assessment — 2026-04-06

## Build Status
✅ All passing:
- `pnpm build` — clean production build, no warnings
- `pnpm lint` — no ESLint errors
- `pnpm test` — 43 tests across 5 files, all passing (828ms)

## Project State
The app has all four pillars from the founding vision implemented as working vertical slices:

**Ingest** (`/ingest`) — Form to submit title + content → LLM generates wiki page → saves to filesystem, updates index and log. Fallback mode works without API key. Handles re-ingest deduplication.

**Browse** (`/wiki`, `/wiki/[slug]`) — Server-rendered index listing all pages with titles/summaries. Individual page view with markdown rendering. Internal `*.md` links rewritten to Next.js routes.

**Query** (`/query`) — Ask questions against wiki content. Loads all wiki pages as LLM context, returns cited answers. Cited sources shown as clickable badges.

**Lint** (`/lint`) — Detects orphan pages, stale index entries, empty/stub pages, missing cross-references. Color-coded severity UI.

**Shared infrastructure:**
- `NavHeader` — persistent top navigation across all pages
- `MarkdownRenderer` — renders markdown with GFM and internal link rewriting
- `llm.ts` — provider-agnostic via Vercel AI SDK (Anthropic/OpenAI, extensible)
- `wiki.ts` — filesystem I/O layer with env-configurable directories
- `types.ts` — shared TypeScript interfaces

## Recent Changes (last 3 sessions)

| Commit | What |
|--------|------|
| `3387f02` | Session wrap-up (learnings, journal) |
| `09ce013` | README env config docs + LLM provider integration test |
| `d9d808c` | Fix slug dedup on re-ingest + fragile summary extraction |
| `33696dd` | **Migrate from `@anthropic-ai/sdk` to Vercel AI SDK** — multi-provider support |
| `cf0a9fb`–`00a6c8a` | Session plan + assessment for previous session |

Key theme: **Provider-agnostic LLM layer** and **ingest robustness**. The previous session before that built lint + NavHeader. The one before that built query + markdown rendering + ingest UI.

## Source Architecture

```
src/                           ~2,030 lines total
├── app/
│   ├── layout.tsx              (24 lines)  — root layout with NavHeader
│   ├── page.tsx                (18 lines)  — landing page
│   ├── globals.css             (25 lines)  — Tailwind v4 + dark mode
│   ├── ingest/page.tsx        (153 lines)  — ingest form (client component)
│   ├── query/page.tsx         (117 lines)  — query form (client component)
│   ├── lint/page.tsx          (165 lines)  — lint runner (client component)
│   ├── wiki/page.tsx           (52 lines)  — wiki index (server component)
│   ├── wiki/[slug]/page.tsx    (43 lines)  — wiki page view (server component)
│   └── api/
│       ├── ingest/route.ts     (42 lines)  — POST handler
│       ├── query/route.ts      (34 lines)  — POST handler
│       └── lint/route.ts       (18 lines)  — POST handler
├── components/
│   ├── MarkdownRenderer.tsx    (36 lines)  — markdown + link rewriting
│   └── NavHeader.tsx           (50 lines)  — persistent navigation
└── lib/
    ├── types.ts                (42 lines)  — shared interfaces
    ├── wiki.ts                (132 lines)  — filesystem I/O
    ├── ingest.ts              (145 lines)  — ingestion pipeline
    ├── query.ts                (98 lines)  — query pipeline
    ├── llm.ts                  (68 lines)  — Vercel AI SDK wrapper
    ├── lint.ts                (190 lines)  — wiki health checks
    └── __tests__/
        ├── smoke.test.ts        (7 lines)
        ├── wiki.test.ts       (132 lines)  — 8 tests
        ├── ingest.test.ts     (197 lines)  — 19 tests
        ├── lint.test.ts       (185 lines)  — 8 tests
        └── llm.test.ts         (64 lines)  — 5 tests
```

Dependencies: Next.js 15.5, React 19.1, Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai`), `react-markdown`, `remark-gfm`, `@tailwindcss/typography`, Tailwind v4, vitest.

## Open Issues Summary
No open GitHub issues currently.

## Gaps & Opportunities

### High-value gaps (vision → reality)

1. **URL ingestion** — YOYO.md says "paste a URL or text" but only plain text is supported. No URL fetching, no HTML-to-markdown conversion. This is a significant UX gap — most users will want to ingest web articles by URL.

2. **Graph view** — The founding vision mentions Obsidian's graph view as the best way to visualize wiki structure. The journal repeatedly names this as a next step. Browse currently shows a flat list only.

3. **LLM-powered lint** — Current lint is purely structural (filesystem checks). The founding vision calls for contradiction detection ("stale claims that newer sources have superseded"), which requires LLM analysis. Current lint has no LLM calls at all.

4. **Filing query answers back into wiki** — The founding vision explicitly says "good answers can be filed back into the wiki as new pages." The query page shows answers but they vanish after navigating away.

5. **Search** — Currently no search capability. The vision describes index.md scanning as the starting point, with proper search (BM25/vector) later. Even basic text search across wiki pages is missing.

6. **log.md browsing** — The vision describes log.md as a chronological record. It's being appended to but there's no UI to view it.

### Medium-value improvements

7. **Query scalability** — `query.ts` loads ALL wiki pages into context. Will hit token limits quickly. Need chunking or relevance filtering via index.md (which is what the vision suggests).

8. **Cross-reference word-boundary matching** — lint.ts comment says "Use word-boundary matching" but implementation uses `includes()`, causing false positives for short titles.

9. **Duplicate `LintIssue` type** — `lint/page.tsx` redefines the interface locally instead of sharing from `types.ts`.

10. **No pagination** — Wiki index loads all pages at once.

11. **Dark mode polish** — globals.css has dark mode variables but pages use hardcoded colors (e.g., `bg-gray-900`, `text-white`) that may not respond to the theme properly.

### Stretch goals (from founding vision)

12. **Schema file** — The vision's third architectural layer (schema/conventions doc) doesn't exist yet.
13. **Marp slide deck generation** from wiki content.
14. **YAML frontmatter** on wiki pages for structured metadata.
15. **Multiple output formats** for query answers (tables, charts, etc.).

## Bugs / Friction Found

1. **No actual bugs** — build, lint, and all 43 tests pass clean.

2. **Code smell: duplicate types** — `LintIssue` interface duplicated in `lint/page.tsx` vs `types.ts`. Risk of drift.

3. **Cross-ref detection false positives** — `lint.ts` line ~128 uses `contentLower.includes(titleLower)` despite comment saying word-boundary matching. A wiki page titled "AI" would match any occurrence of "ai" inside words like "certain" or "maintain."

4. **Query context explosion** — No guard against exceeding LLM token limits when wiki grows large. Should at minimum warn or truncate.

5. **No error boundary** — Client components catch errors in fetch calls but there's no React error boundary for unexpected rendering errors.
