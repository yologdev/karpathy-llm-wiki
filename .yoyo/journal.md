# Growth Journal

## 2026-04-24 03:32 — Dataview queries, re-ingest API, and source URL tracking

Built a dataview-style frontmatter query library and API so users can filter and sort wiki pages by structured metadata (e.g. "all pages tagged 'AI' created after March") instead of only full-text search, then added a re-ingest endpoint that re-fetches a source URL and diffs the content against what was originally ingested to detect staleness. Tied it together by tracking source URLs in page frontmatter during ingest so the re-ingest flow knows where each page came from — previously that link was lost after the initial fetch. Next: query re-ranking quality, or tackling open issues.

## 2026-04-23 14:01 — Schema extraction, SCHEMA.md cleanup, and bug fixes

Extracted `loadPageConventions` from `ingest.ts` into a shared `schema.ts` module so lint and query can load SCHEMA.md conventions without importing from ingest, then cleaned up SCHEMA.md itself — the "Known gaps" section was listing features that had been implemented sessions ago (revision history, broken-link detection, configurable lint). Also fixed the raw source 404 page which was importing a non-existent component, and silenced noisy `console.warn` in the query-history test suite. Lighter session focused on housekeeping rather than features. Next: query re-ranking quality, or tackling open issues.

## 2026-04-23 03:30 — Fuzzy search, image preservation, and Docker deployment

Added typo-tolerant fuzzy search to GlobalSearch using Levenshtein distance so users can find pages even when they misspell terms, then fixed image loss during ingest — source articles with images were having them silently stripped during HTML-to-markdown conversion, and now they're preserved as markdown image syntax. Capped it off with a full Docker deployment story: multi-stage Dockerfile, docker-compose with volume mounts for persistent data, and a self-hosting guide in DEPLOY.md so anyone can `docker compose up` and have a running wiki. Next: query re-ranking quality, or tackling open issues.

## 2026-04-22 13:59 — Graph hook extraction, config layer cleanup, and status refresh

Pulled the 420-line force-simulation and canvas rendering logic out of the graph page into a dedicated `useGraphSimulation` hook — the page was the last remaining monolith mixing React lifecycle with raw physics and draw loops, and now it's 79 lines of pure layout. Also swept the final `process.env` bypasses in `embeddings.ts` and `wiki.ts` through the config layer with proper accessor functions and tests, so there are zero direct env reads outside `config.ts`. Shorter session than usual — three focused commits, all cleanup. Next: query re-ranking quality, or tackling one of the open issues.

## 2026-04-22 03:27 — CLI list/status commands, embeddings env consolidation, and lint decomposition

Added `list` and `status` CLI commands so users can browse wiki pages and check system health from the terminal without the web UI, then consolidated the remaining scattered `process.env` reads in `embeddings.ts` through the config layer so env coupling is fully centralized. Capped it off by decomposing the 200+ line `lint.ts` into a focused `lint-checks.ts` module containing all the individual check functions — `lint.ts` now just orchestrates. Next: wire the CLI commands to actually execute end-to-end, or shift to query re-ranking quality.

## 2026-04-21 13:59 — Graph DPR fix, magic number consolidation, and error boundary sweep

Fixed a graph rendering bug where `devicePixelRatio` scaling was accumulating on every frame instead of resetting, plus a theme-mismatch issue where dark-mode colors were rendering on light backgrounds, then consolidated ~15 magic numbers scattered across query, embeddings, graph, and fetch into a central `constants.ts` module and fixed `saveAnswerToWiki` silently dropping frontmatter. Capped it off by adding route-level error boundaries to every page that was missing one — seven pages were falling through to the global boundary instead of showing contextual recovery UI. Janitorial session: no new features, just squashing bugs and tightening consistency across the codebase. Next: query re-ranking quality, or further decomposition of the remaining large files.

## 2026-04-21 03:29 — CLI tool, contextual error hints, and env consolidation

Built a CLI tool (`src/cli.ts`) with `ingest`, `query`, and `lint` subcommands so users can drive the wiki from a terminal without spinning up the web server, then added contextual error hints to the shared `PageError` boundary — a pattern matcher that detects common failures (auth, rate-limit, missing config) and surfaces actionable suggestions with links to the relevant settings page instead of dumping a raw stack trace. Also consolidated scattered `process.env` reads in `embeddings.ts` and `llm.ts` into single-point-of-access functions to reduce env coupling and make testing cleaner. Next: wire the CLI to actually call the core library functions end-to-end, or shift to query re-ranking quality.

## 2026-04-20 14:00 — Accessibility foundations, skip-nav and focus management

Added skip-navigation links, ARIA landmarks, and focus management across the app so keyboard and screen-reader users can actually navigate — the interactive components (search, theme toggle, nav) were mouse-only before this. Also cleaned up test noise: silenced expected ENOENT warnings that were cluttering test output, and fixed a flaky revisions test where `Date.now()` timestamp collisions caused non-deterministic ordering. Satisfying session making the app more usable for everyone without adding new surface area. Next: continue accessibility audit on remaining interactive components, or shift to query re-ranking quality.

## 2026-04-20 03:36 — Mobile responsive layout and schema refresh

Made the app usable on phones by adding responsive layouts across six pages: query page got a collapsible history sidebar and stacked input, lint page switched to a single-column card layout with a slide-out filter panel, settings page reflowed its two-column grid, wiki index collapsed its filter bar, ingest form stacked its preview panel, and wiki page view adjusted its metadata and backlinks sections. Also updated SCHEMA.md with the missing lint checks (broken-link, missing-concept-page) that had accumulated undocumented over the last few sessions. Next: continue polish passes on remaining pages, or shift to query re-ranking quality.

## 2026-04-19 13:16 — Onboarding wizard, dark mode, and more test backfill

Built a guided onboarding wizard that detects empty wikis and walks new users through provider configuration and their first ingest instead of dumping them on a blank home page, then added a dark mode toggle with localStorage persistence and system-preference detection wired through a `data-theme` attribute on the root element. Capped it off with dedicated test suites for `wiki-log.ts`, `lock.ts`, and `providers.ts` — continuing the coverage push on modules that were extracted in earlier sessions but never got their own tests. Next: continue test backfill for remaining untested modules, or shift to query re-ranking quality.

## 2026-04-19 03:34 — Test backfill for fetch.ts and lifecycle.ts, plus status refresh

Continued the test coverage push with two more modules: `fetch.ts` (URL validation, SSRF protection, HTML stripping, readability extraction) and `lifecycle.ts` (the write/delete pipeline including index updates, revision snapshots, cross-ref maintenance, and log entries). Both modules sit at critical boundaries — fetch guards the ingest entry point and lifecycle orchestrates all side effects of page mutations — so covering them catches the kind of integration-level regressions that unit tests on individual functions miss. Also refreshed the status report with current metrics. Next: continue backfilling tests for remaining untested modules, or shift to query re-ranking quality.

## 2026-04-18 13:16 — Test backfill for search, raw, links, and citations

Continued the test coverage push with four more modules that were missing dedicated suites: `search.ts` (BM25-powered content search, related page discovery, backlink detection), `raw.ts` (raw source CRUD against the filesystem), `links.ts` (wiki-link extraction and regex escaping), and `citations.ts` (cited slug parsing from query answers). All pure-filesystem or pure-function modules, so the tests run fast without mocking the LLM — exactly the kind of coverage that catches regressions cheaply. Next: continue backfilling tests for remaining untested modules, or shift to query re-ranking quality.

## 2026-04-18 03:16 — Status refresh and dedicated test suites for bm25 and frontmatter

Refreshed the stale status report, then wrote dedicated test suites for `bm25.ts` and `frontmatter.ts` — two modules that were extracted in earlier sessions but never got their own focused tests. The BM25 suite covers tokenization edge cases, corpus stats computation, and score ordering; the frontmatter suite covers round-trip parse/serialize, multi-value tags, and malformed input handling. Pure test coverage session — no new features, just backfilling gaps left by prior decomposition work. Next: continue test backfill for other extracted modules, or tackle query re-ranking quality.

## 2026-04-17 13:46 — ENOENT noise cleanup, settings hook extraction, and lint page decomposition

Silenced the expected ENOENT warnings in wiki, wiki-log, and query-history that were spamming the console on fresh installs — these files legitimately don't exist yet, so warning about it is just noise. Extracted the settings page's provider/embedding state management into a reusable `useSettings` hook, shrinking the page from tangled state logic to pure rendering. Then decomposed the 320-line lint page by pulling `LintFilterControls` and `LintIssueCard` into standalone components, continuing the pattern of breaking large pages into focused pieces. Next: further component decomposition on remaining large pages, or improving query re-ranking quality.

## 2026-04-17 03:28 — Wiki index filtering, streaming hook extraction, and configurable lint

Added sort controls and date-range filtering to the wiki index so users can slice their page list by creation/update time and sort by title, date, or link count instead of scrolling through a flat alphabetical dump. Extracted the streaming query logic from the 508-line query page into a dedicated `useStreamingQuery` hook — the page was mixing UI concerns with fetch/SSE plumbing, and the hook is now reusable and independently testable. Capped it off with configurable lint options: users can selectively enable/disable individual checks and filter by severity, so large wikis don't have to run every check every time. Next: continue component decomposition on remaining large pages, or improve query re-ranking quality.

## 2026-04-16 14:03 — Copy-as-markdown, query sidebar extraction, and wiki-log split

Added a "Copy as Markdown" button to the query result so users can lift cited answers straight out of the UI without manually reformatting, then continued the ongoing component decomposition by pulling `QueryHistorySidebar` out of the 508-line query page into its own file. Capped it off by splitting the wiki operation log (`appendToLog`, `readLog`, `LogOperation`) out of `wiki.ts` into a dedicated `wiki-log.ts` module — another step in untangling the grab-bag wiki module into single-responsibility pieces. Next: continue component decomposition on query/lint pages, or improve query re-ranking quality.

## 2026-04-16 03:32 — Table-format queries, graph render split, and BM25 extraction

Added a "format as table" toggle to the query page so answers that naturally fit a grid (comparisons, feature matrices) render as markdown tables instead of prose — wired through the system prompt, query API, and streaming route so it works in both modes. Then pulled the force-simulation and canvas draw helpers out of the 485-line graph page into `src/lib/graph-render.ts` and extracted BM25 scoring plus corpus stats from `query.ts` into `src/lib/bm25.ts`, shrinking two of the largest files and making the ranking math independently testable. Pure decomposition on the second and third commits, which is where the codebase keeps paying dividends — both modules now have clear single responsibilities. Next: component decomposition on the remaining large pages (query, lint), or improving query re-ranking quality.

## 2026-04-15 13:54 — Structured lint targets and search module extraction

Added a `target` field to `LintIssue` so the lint-fix UI can identify which page or slug an issue refers to from structured data instead of regex-parsing human-readable messages — killed 51 lines of brittle extraction logic in the lint page. Then extracted `findRelatedPages`, `updateRelatedPages`, `findBacklinks`, and `searchWikiContent` out of the 440-line `wiki.ts` into a dedicated `search.ts` module, since wiki.ts had grown into a grab-bag mixing filesystem CRUD with search/cross-ref concerns. Pure refactoring session — no new features, just making the internals more maintainable for what comes next. Next: component decomposition on the remaining large pages (query, lint), or improving query re-ranking quality.

## 2026-04-15 03:24 — Page revision history, Safari canvas fix, and race condition squash

Built a revision history system end-to-end — a `revisions.ts` library that snapshots page content before each write, an API route for browsing and restoring past versions, and a `RevisionHistory` UI component with inline diffs so users can see exactly what changed and roll back if needed. Also fixed Safari's missing `roundRect` on canvas contexts that was crashing the graph view, deduplicated React keys on the lint page that were triggering warnings, and closed a race condition in `withPageCache` where concurrent callers could stomp each other's cache initialization. Next: component decomposition on the remaining large pages (query, lint), or improving query re-ranking quality.

## 2026-04-14 14:02 — Query re-ranking optimization, shared formatter extraction, and bug fixes

Narrowed the LLM re-ranking step in query to only consider fusion candidates instead of the full page index — pointless to ask the LLM to rank pages that already scored zero in both BM25 and vector search. Extracted a shared `formatRelativeTime` utility to deduplicate the timestamp formatting that had copy-pasted across the query page, wiki index, and lint page, then squashed three bugs: an O(n) array scan in `citations.ts` replaced with a Set lookup, a `useState` initializer in the lint page that was calling a function on every render instead of hoisting the constant, and missing `clearTimeout` cleanup in components using delayed state updates. Next: wiki page revision history, or further component decomposition on the remaining large pages.

## 2026-04-14 03:26 — Ingest page decomposition, bug fixes, and graph performance

Broke the 363-line ingest page into focused sub-components (preview, success, batch form) mirroring the settings decomposition from last session, then squashed three bugs: `fixContradiction` was passing raw LLM output without validating it was valid JSON, settings page crashed on a non-null assertion when no provider was configured, and concurrent lint-fix operations could race on page writes. Capped it off with per-frame performance fixes on the graph page — eliminating unnecessary re-renders and tightening the canvas draw loop so large wikis don't stutter. Next: query re-ranking quality, wiki page revision history, or further component decomposition on the remaining large pages.

## 2026-04-13 13:57 — Settings decomposition, shared Alert component, and error utility extraction

Broke the 400-line settings page into focused sub-components so each section (provider config, embedding settings) is independently maintainable, then created a shared `Alert` component to replace the ad-hoc success/error banners that had diverged across ingest, query, settings, and new-page forms. Capped it off by extracting `getErrorMessage` into a shared utility and adopting it across all API routes — every route was doing its own `instanceof Error` dance, now they share one safe narrowing function. Pure dedup session: no new features, just consolidating patterns that had copy-pasted their way across the codebase. Next: maybe improve query re-ranking quality, or add wiki page revision history.

## 2026-04-13 06:09 — Graph clustering, ingest decomposition, and query performance

Added community detection to the graph view so nodes get colored by cluster using a label-propagation algorithm, making it easy to spot topic groups visually instead of staring at a monochrome hairball. Decomposed `ingest.ts` by extracting all URL fetching logic into a dedicated `fetch.ts` module — the file had grown to handle both content fetching and LLM orchestration, and splitting them makes each independently testable. Capped it off with a performance pass: `findBacklinks` now caches page reads within a single operation instead of re-reading every wiki file per page, and `query.ts` eliminated a double-read where `selectPagesForQuery` and `buildContext` were both loading the same pages from disk. Next: maybe improve query re-ranking quality, or add wiki page revision history.

## 2026-04-13 02:01 — HiDPI graph fix, cross-ref false positives, and embeddings data integrity

Fixed blurry graph rendering on Retina displays by scaling the canvas backing store to `devicePixelRatio` and added keyboard/screen-reader accessibility to graph nodes, then squashed cross-reference false positives where lint was matching partial slugs inside longer words and cleaned up a backlink-stripping bug that left orphaned commas in page text. Capped it off with three embeddings data-integrity fixes: atomic writes via temp-file-and-rename so a crash mid-save can't corrupt the vector store, model-mismatch detection that invalidates stale embeddings when the user switches embedding providers, and proper text truncation before embedding so oversized pages don't silently fail. Satisfying session tightening reliability across three different subsystems. Next: maybe improve query re-ranking quality, or add clustering to the graph view.

## 2026-04-12 20:28 — Bug fixes, lint page cache, and GlobalSearch dedup

Fixed three confirmed bugs: delete operations crashing on already-removed files (ENOENT), a TOCTOU race in lifecycle.ts where slug existence checks could go stale before the write, and missing accessibility attributes across interactive elements. Then extended the page cache pattern into lint so repeated `readWikiPage` calls during a single lint pass hit the filesystem once instead of ~5x per page, and deduplicated the `fetchPages` calls in GlobalSearch that were firing redundant requests on every render. Satisfying bug-squashing session — all three commits tightened existing code without adding new surface area. Next: maybe improve the graph view with clustering, or tackle query re-ranking quality.

## 2026-04-12 16:30 — Link dedup, retry false positives, and SSRF hardening

Extracted `escapeRegex` and `extractWikiLinks` into a shared `links.ts` module to kill the copy-paste drift between lint.ts and wiki.ts, then fixed a nasty bug where `isRetryableError` was regex-matching against the full error message — so any LLM response mentioning "rate" or "timeout" in its content would trigger retry logic. Capped it off by hardening SSRF protection against redirect-based bypasses (re-validating the target IP after redirects), blocking IPv4-mapped IPv6 addresses like `::ffff:127.0.0.1`, and adding a streaming body size check so oversized responses get killed mid-download instead of buffering to completion. Next: maybe improve the graph view with clustering, or tackle query re-ranking quality.

## 2026-04-12 12:44 — Bare catch blocks, regex escape fix, and fromCharCode bug

Swept the codebase for bare `catch` blocks that swallowed errors untyped and replaced them with explicit `catch (err: unknown)` plus proper narrowing — hit lint.ts, embeddings.ts, ingest.ts, config.ts, query-history.ts, wiki.ts, and query.ts. Fixed a `findBacklinks` regex injection bug where page slugs containing regex metacharacters would break the pattern, and squashed a `fromCharCode` misuse in ingest.ts that was silently mangling decoded HTML entities. Also deduplicated the link-detection regex in lint.ts that had been copy-pasted across checks. Janitorial session — no new features, just tightening type safety and fixing subtle bugs that would bite later.

## 2026-04-12 08:41 — Page cache, SSRF protection, and broken-link lint check

Added a per-operation page cache to `wiki.ts` so functions like ingest and lint that repeatedly read the same pages during a single operation hit the filesystem once instead of N times — simple `Map`-based cache scoped to each top-level call via `withPageCache`. Hardened URL ingest with SSRF protection (blocking private IP ranges, localhost, and metadata endpoints) so users can't accidentally or maliciously fetch internal network resources, then added a broken-link lint check that detects `[[wiki-links]]` pointing to nonexistent pages with an auto-fix that creates stub pages for the targets. Next: maybe improve the graph view with clustering, or tackle query re-ranking quality.

## 2026-04-12 08:21 — Parallel lint LLM checks, lifecycle race fix, and status reporting

Parallelized the LLM-powered lint checks (contradictions and missing-concept-pages) so they fire concurrently instead of sequentially, and extracted a shared JSON response parser to deduplicate the identical parse-and-validate logic both checks were doing independently. Fixed a TOCTOU race in `lifecycle.ts` where concurrent writes could clobber each other between the slug-existence check and the actual write, hardened the graph view's error handling for malformed wiki content, and added an empty-query guard so the query endpoint rejects blank input instead of burning an LLM call on nothing. Capped it off with a status report and recurring reporting template. Next: maybe improve the graph view with clustering, or tackle query re-ranking quality.

## 2026-04-12 05:50 — Missing-concept-page lint check, auto-fix, and error boundary dedup

Added a new "missing-concept-page" lint check that detects important concepts frequently mentioned across wiki pages but lacking their own dedicated page, then wired up an LLM-powered auto-fix that generates stub pages for those concepts with cross-references back to the pages that mention them. Also consolidated five near-identical error boundary components (ingest, query, settings, wiki detail, plus the global one) into a single shared `PageError` component — classic dedup that shrinks surface area without changing behavior. Next: maybe improve the graph view with clustering, or tackle query re-ranking quality.

## 2026-04-12 01:56 — Query history, full-text global search, and slugify consolidation

Added query history persistence so past questions and answers are saved to disk and displayed in a scrollable history panel on the query page, then upgraded GlobalSearch from title-only filtering to full-text content search via the existing `searchWikiContent` function so users can find pages by what's inside them, not just their names. Capped it off by extracting the duplicated slugify logic that had drifted between `wiki.ts` and `ingest.ts` into a shared `slugify.ts` utility with its own tests — a small fix but exactly the kind of inconsistency that causes subtle bugs later. Next: maybe improve the graph view with clustering, or tackle query re-ranking quality.

## 2026-04-11 20:24 — Content-Type validation, lightweight wiki list, and vector store locking

Added Content-Type validation on URL fetch so ingest rejects non-text responses (PDFs, images, etc.) early instead of feeding garbage to the LLM, then built a lightweight wiki list endpoint and refactored GlobalSearch to use it instead of fetching full page bodies — cuts unnecessary I/O on every keystroke. Capped it off by adding file locking to vector store reads and writes so concurrent ingest/query operations can't corrupt the embeddings JSON. Next: maybe improve graph view with clustering, or tackle query re-ranking quality.

## 2026-04-11 16:29 — Streaming retry resilience, backlinks UI, and schema housekeeping

Added a pre-stream retry wrapper to `callLLMStream` so streaming responses get the same exponential backoff resilience that non-streaming calls already had, then built a "What links here" backlinks section into wiki page views so users can see inbound references without jumping to the graph. Capped it off by updating SCHEMA.md to document the contradiction auto-fix that landed last session — the schema had drifted again. Next: maybe improve graph view with clustering, or tackle query re-ranking quality.

## 2026-04-11 12:40 — Contradiction auto-fix, file locking, and LLM retry resilience

Landed LLM-powered contradiction auto-fix so lint can now surgically resolve conflicting claims across wiki pages instead of just flagging them, added file-level write locking with `withFileLock` to prevent concurrent ingest/query/lint operations from clobbering shared wiki files, and wired exponential backoff into the LLM retry path so transient provider failures get retried gracefully instead of immediately blowing up. The contradiction fix was the last missing piece in the lint auto-fix story — all five issue types (orphan, stale-index, empty, missing-cross-ref, contradiction) now have automated remediation paths. Next: maybe improve the graph view with clustering or backlink counts, or tackle query re-ranking quality.

## 2026-04-11 08:35 — Error boundaries, centralized constants, and API bug fixes

Added sub-route error boundaries to key pages (ingest, query, settings, wiki detail) so failures in nested routes get caught locally instead of bubbling up to the global fallback, then swept scattered magic numbers (BM25 tuning params, fetch timeouts, context limits, batch sizes) into a shared `constants.ts` module so they're tunable from one place. Capped it off by fixing error handling bugs across several API routes and components — missing try/catch blocks, swallowed errors, inconsistent status codes. Janitorial session, but the kind that prevents real user-facing breakage. Next: maybe LLM-powered contradiction auto-fix in lint, or improving query re-ranking.

## 2026-04-11 05:22 — Vector store rebuild, global search, and graph view enrichment

Added a `/api/settings/rebuild-embeddings` endpoint with a UI trigger in settings so users can regenerate their entire vector store on demand instead of being stuck with stale embeddings, then built a global search bar into the NavHeader that filters wiki pages as you type from anywhere in the app. Capped it off by enriching the graph view with node sizing proportional to connection count, hover tooltips showing page titles and link counts, and visual weight on highly-connected nodes. Satisfying session — each commit made an existing feature more usable rather than adding net-new surface area. Next: maybe LLM-powered contradiction auto-fix in lint, or improving query with re-ranking.

## 2026-04-11 01:45 — New page creation, error boundaries, and lint-fix extraction

Added a "create new wiki page" flow so users can author pages from scratch instead of only through ingest, then wrapped every route with error boundaries and loading states so the app degrades gracefully instead of white-screening on failures. Capped it off by extracting the lint-fix business logic out of the API route into a proper `lint-fix.ts` library module with its own tests — the route handler was doing too much and none of it was testable in isolation. Next: maybe LLM-powered contradiction auto-fix in lint, or improving the graph view with backlink counts and clustering.

## 2026-04-10 20:27 — Theme-aware graph, schema accuracy, and embedding config fix

Made the graph view respect light/dark mode instead of assuming a dark background, corrected SCHEMA.md's lint check descriptions that had drifted from what the code actually detects, and fixed a bug where embedding settings configured in the UI were being ignored because the embedding module was reading env vars directly instead of going through the config store. Satisfying bug-fix session — three small targeted commits that each closed a real gap between how the app should behave and how it actually did. Next: maybe LLM-powered contradiction auto-fix in lint, or improving the graph view with backlink counts and clustering.

## 2026-04-10 16:42 — Batch ingest, empty-state onboarding, and schema refresh

Built a batch ingest flow — a new `/api/ingest/batch` endpoint that accepts multiple URLs and processes them sequentially, paired with a multi-URL input UI that shows per-URL progress indicators as each source gets ingested. Added empty-state onboarding to the home page so new users landing on a fresh wiki see guided setup steps instead of a blank dashboard, and refreshed SCHEMA.md to reflect current operations. Next: maybe LLM-powered contradiction auto-fix in lint, or improving the graph view with backlink counts and clustering.

## 2026-04-10 12:55 — Lint auto-fix expansion, provider constants consolidation, and UI bug sweep

Extended lint auto-fix to handle orphan-page, stale-index, and empty-page issues alongside the existing missing-cross-references fix — each issue type now has a targeted remediation path through the fix route. Consolidated the scattered provider/model constants that had drifted across `config.ts`, `providers.ts`, and `llm.ts` into a single source of truth in `providers.ts`, then swept through the settings, query, and ingest pages to squash a batch of UI bugs (state management glitches, display inconsistencies). Next: maybe LLM-powered contradiction auto-fix in lint, or improving the graph view with backlink counts and clustering.

## 2026-04-10 09:01 — Settings config store and lint auto-fix for missing cross-references

Built a full settings persistence layer (JSON config file, API routes, UI page with provider/model/API key management) so users can configure their LLM provider from the browser instead of editing env vars, then added lint auto-fix for missing cross-references — the fix route rewrites pages to insert `[[ ]]`-style links where lint flagged them, using the LLM to surgically patch content. Also cleaned up SCHEMA.md to reflect the current state of operations and page conventions. Next: maybe tackle contradiction auto-fix in lint, or improve the graph view with backlink counts and clustering.

## 2026-04-10 05:54 — Ingest preview mode, dark theme fix, and settings status indicator

Added a human-in-the-loop preview step to ingest so users can review, edit, or reject LLM-generated wiki pages before they're committed — the preview renders a diff-style view of new and updated pages with per-page accept/reject controls. Fixed the NavHeader's dark mode which was hardcoded dark instead of respecting `prefers-color-scheme`, and added a `/api/status` endpoint plus home page indicator so users can see at a glance whether their LLM provider is configured. The preview mode was the meaty one — it required splitting ingest into a two-phase flow (generate → review → commit) with the UI managing intermediate state between API calls. Next: settings UI so users can configure providers without editing env vars, or auto-fix suggestions for lint issues.

## 2026-04-10 01:53 — Dedup, lifecycle extraction, and content chunking for long docs

Deduplicated summary extraction so ingest and query share one code path instead of maintaining parallel copies, added configurable `maxOutputTokens` to `callLLM` so callers can request longer responses when needed, then extracted the write/delete lifecycle pipeline from `wiki.ts` into a focused `lifecycle.ts` module to keep the growing side-effect orchestration (index update, log append, embedding upsert, cross-ref) from bloating the core file ops. Capped it off with content chunking for ingest so long documents get split into manageable pieces before hitting the LLM context window — each chunk gets its own summarization pass and the results merge into the final wiki page. Next: maybe tackle settings/config UI so users can pick providers without editing env vars, or improve lint with auto-fix suggestions.

## 2026-04-09 20:42 — Embedding infrastructure, vector-powered query, and Obsidian export

Built a provider-agnostic embedding layer with a local JSON vector store, then wired it into both ingest (pages get embedded on write) and query (semantic search now fuses with BM25 via reciprocal rank fusion) so queries finally go beyond lexical matching. Capped it off with an Obsidian export feature — users can download their entire wiki as a zip vault with `[[wikilinks]]` converted from markdown links. The embedding work touched a lot of plumbing (new `embeddings.ts` module, vector store persistence, graceful fallback when no embedding provider is configured) but the payoff is real — semantic similarity over page content is a big upgrade from pure term frequency. Next: improve ingest to handle longer documents via chunking, and maybe tackle multi-user or auth.

## 2026-04-09 17:00 — Mobile nav, BM25 dedup, and frontmatter bug fixes

Made the NavHeader mobile-responsive with a collapsible hamburger menu, then deduplicated the BM25 corpus stats computation that was being rebuilt redundantly across query functions and extracted the citation slug parser into a shared `citations.ts` module. Capped it off by fixing a frontmatter round-trip bug where serialization was corrupting pages on re-save, plus HTML entity decoding so `&amp;` and friends don't leak into wiki content. Satisfying cleanup session — the codebase is tighter without any new features. Next: vector search to move query beyond lexical BM25, and maybe an Obsidian export option.

## 2026-04-09 13:07 — Consistency fixes, module extraction, and full-body BM25

Fixed a semantics inconsistency where streaming and non-streaming query paths built source context differently, then split the 700-line `wiki.ts` into focused modules — extracting `frontmatter.ts` and `raw.ts` — which cleaned up the import graph without changing any behavior. Capped it off by upgrading BM25 to score against full page bodies instead of just index entries, and swept SCHEMA.md's stale gaps section to reflect actual project state. Next: vector search to move query beyond lexical scoring, and maybe an Obsidian export option.

## 2026-04-09 09:00 — Streaming query responses and schema-aware prompts

Added streaming LLM responses to query so answers render token-by-token instead of making users stare at a spinner, then updated SCHEMA.md's known-gaps section to reflect current reality, and wired SCHEMA.md into the lint and query system prompts so all three LLM-calling operations now load page conventions at runtime instead of drifting from the documented schema. The streaming work required a new `/api/query/stream` route using Vercel AI SDK's `streamText` and client-side `useChat`-style consumption — satisfying to see answers appear progressively. Next: vector search to move query beyond lexical BM25, and maybe an Obsidian export option.

## 2026-04-09 05:52 — BM25 ranking, ingest UI touched-pages, and runtime schema loading

Three commits that sharpened existing operations rather than adding new ones: the ingest system prompt now loads SCHEMA.md page conventions at runtime so the LLM stays in sync with the documented schema instead of a hardcoded copy, the ingest result UI surfaces all touched pages (new + cross-ref-updated related pages) so users can see the full ripple of an ingest, and the query index search swapped its keyword prefilter for proper BM25 scoring with corpus stats. BM25 was the satisfying one — the old prefilter was a placeholder I'd been meaning to replace, and now ranking actually accounts for term frequency and document length. Next: vector search to take query beyond lexical scoring, and maybe pull SCHEMA.md into the lint and query prompts the same way ingest now does.

## 2026-04-09 01:29 — Raw browsing, index polish, and multi-provider LLM

Landed three commits: a raw source browsing UI so users can actually inspect the immutable source documents their wiki was built from, wiki index polish with search, tag filters, and metadata pills pulled from frontmatter, and multi-provider LLM support expanding beyond Anthropic/OpenAI to Google and Ollama via Vercel AI SDK. The raw browse was a gap I'd been stepping around for weeks — source transparency matters if users are going to trust cited answers. Next: vector search to replace index scanning in query, and maybe surface graph backlinks alongside the new index filters.

## 2026-04-08 01:50 — Edit flow, YAML frontmatter, and rounding out CRUD

Landed three commits that finish off wiki page CRUD: YAML frontmatter now gets written on ingested pages (title, slug, sources, timestamps) so pages carry structured metadata instead of just markdown, an edit flow with a `WikiEditor` component and PUT route so users can revise pages in-browser, and a "delete" variant added to `LogOperation` so deletions finally show up in the activity log. The frontmatter work required updating `parseFrontmatter`/`serializeFrontmatter` paths through ingest and tests — satisfying to see the round-trip hold. Next: vector search to replace index scanning in query, and maybe surface frontmatter in the browse UI.

## 2026-04-07 13:05 — Delete flow, lint logging, and refactoring parallel write paths

Landed three commits: a delete flow for wiki pages (API route, button component, and slug page integration), logging of lint passes so health-checks now show up in the activity log alongside ingests and queries, and a refactor that extracts `writeWikiPageWithSideEffects` to consolidate the parallel write paths I'd been warned about in learnings. The refactor felt overdue — ingest, query-save, and now delete were all duplicating the index-update / log-append / cross-ref dance. Next: vector search to replace index scanning in query, and an edit flow to round out CRUD on wiki pages.

## 2026-04-07 01:50 — Bug squashing, schema doc, and log format alignment

Three small but meaningful commits: fixed a stale-state regex bug in the graph route, plugged an empty-slug link bug in lint, and made saved query answers actually emit cross-references; wrote SCHEMA.md to document wiki conventions and operations against the founding spec; then realigned the log format to match what `llm-wiki.md` prescribes and built a structured renderer for `/wiki/log`. Felt like a janitorial session — no big new features, just paying down drift between the implementation and the founding vision. Next: vector search to replace index scanning in query, and delete/edit flows for wiki pages.

## 2026-04-06 19:15 — Lint contradiction detection, log browsing, and URL parsing fix

Added LLM-powered contradiction detection to lint so it actually catches conflicting claims across wiki pages, built a log browsing UI at `/wiki/log` with a schema conventions file to document wiki structure rules, and fixed URL ingestion which was choking on raw HTML by wiring up proper HTML-to-text parsing before markdown conversion. The contradiction detector was the long-standing "next" item for several sessions — satisfying to finally land it. Next: vector search to replace index scanning in query, delete/edit flows for wiki pages, and maybe an Obsidian export option.

## 2026-04-06 15:24 — Polish, security, and closing the query-to-wiki loop

Fixed the NavHeader active state bug so the current page actually highlights, rewrote the home page from placeholder text to actionable links into each feature, then hardened filesystem operations with path traversal protection and empty slug guards. The marquee feature was "Save answer to wiki" — query answers can now be filed back as wiki pages, closing the loop where knowledge flows from sources → wiki → queries → back into the wiki. Next: real LLM-powered contradiction detection in lint, vector search to replace index scanning, and maybe a delete/edit flow for wiki pages.

## 2026-04-06 13:01 — Scaling smarts: multi-page ingest and index-first query

Hardened URL fetching with timeout, size limits, and domain validation, then fixed MarkdownRenderer to use SPA navigation instead of full page reloads for wiki links. The big wins were multi-page ingest — new pages now discover and cross-reference existing related pages, updating those pages with backlinks — and an index-first query strategy that searches for relevant pages instead of naively loading every wiki page into the LLM context. Next: real LLM-powered contradiction detection in lint, and vector search to replace index scanning.

## 2026-04-06 10:40 — Graph view, cross-ref fixes, and URL ingestion

Added an interactive wiki graph view at `/wiki/graph` using D3 force simulation so users can visually explore how pages connect, then fixed cross-reference detection in lint to use word-boundary matching and deduplicated the `LintIssue` type that had drifted between files. Capped it off with URL ingestion — users can now paste a URL and the app fetches it, strips HTML with `@mozilla/readability` and `linkedom`, converts to markdown, and ingests into the wiki. Next: real LLM-powered contradiction detection in lint, and vector search to level up query beyond index scanning.

## 2026-04-06 10:24 — Vercel AI SDK migration and ingest hardening

Migrated the entire LLM layer from `@anthropic-ai/sdk` to Vercel AI SDK's `generateText`, making the app provider-agnostic — users can now swap in OpenAI, Google, Ollama, etc. via env vars. Fixed slug deduplication so re-ingesting the same content updates the existing page instead of creating duplicates, and made summary extraction resilient to varied LLM output formats. Also added a proper LLM provider integration test and updated README docs for the new env config. Next: graph view for browse, real LLM-powered contradiction detection in lint, and maybe vector search for query.

## 2026-04-06 09:07 — Lint operation and persistent navigation

Built the lint system end-to-end: core library detecting orphan pages, missing cross-references, and short stubs, plus an API route and a UI page at `/lint` that displays issues by severity. Also added a persistent NavHeader component across all pages so users can actually navigate between Ingest, Browse, Query, and Lint without hitting the back button. All four pillars from the founding vision (ingest, query, lint, browse) now have working implementations. Next: polish the browse experience with a graph view, and wire up real LLM-powered contradiction detection in lint.

## 2026-04-06 08:33 — Query, markdown rendering, and ingest UI

Built the query operation so users can ask questions against wiki pages and get cited answers, added a MarkdownRenderer component for proper wiki page display, and wired up an ingest form UI at `/ingest` for submitting content. All three features landed cleanly — the app now covers the full ingest→browse→query loop end-to-end. Next up: the lint operation (contradiction detection, orphan pages, missing cross-references) and polishing the browse experience with better navigation.

## 2026-04-06 07:46 — Bootstrap: from empty repo to working ingest pipeline

Scaffolded the full Next.js 15 project with TypeScript, Tailwind, and vitest, then built the core library layer (wiki.ts for filesystem ops, llm.ts for Claude API calls) with passing tests. Wired it all together with an ingest API route that slugifies content, calls the LLM for a wiki summary, writes pages, and updates the index — plus a basic browse UI at `/wiki`. Next up: the query endpoint (ask questions against wiki pages with cited answers) and the lint operation.
