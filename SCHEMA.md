# Wiki Schema

This document is the conventions-and-operations spec for the LLM Wiki maintained
in this repo. It is meant to be read by any LLM (or human) that operates on the
wiki — it codifies how pages are structured, how the three core operations
(ingest, query, lint) should behave, and what bookkeeping each operation owes
back to the wiki. The founding vision for the project lives in
[`llm-wiki.md`](llm-wiki.md); this file is the practical schema that turns that
vision into a disciplined workflow.

## Layers

The system has three layers, mirroring the architecture described in
`llm-wiki.md` §Architecture:

**Raw sources** live under `raw/` and are immutable. The LLM reads from them
but never rewrites them. They are the source of truth and are gitignored —
each user grows their own raw collection locally.

**The wiki** lives under `wiki/` and is entirely LLM-generated: summaries,
entity pages, concept pages, an `index.md`, and a `log.md`. The LLM owns this
layer end-to-end. It is also gitignored — humans read it, the LLM writes it.

**The schema** is this file. It co-evolves with the project: when a new
convention emerges (a new lint check, a new page type, a new prompt rule),
yoyo updates this document so future sessions inherit the convention. See
[Co-evolution](#co-evolution) below.

## Page conventions

- Filenames are kebab-case slugs ending in `.md`. Slugs must match
  `/^[a-z0-9][a-z0-9-]*$/` (enforced by `validateSlug()` in `src/lib/wiki.ts`).
- Every page starts with an H1 title (`# Title`).
- Every page has a one-paragraph summary immediately after the H1. The index
  builder uses this paragraph as the page's catalog blurb.
- Cross-references between wiki pages use markdown links of the form
  `[Title](other-slug.md)` — relative, no leading slash, `.md` suffix
  required. The `.md` suffix is what lets the graph builder
  (`src/app/api/wiki/graph/route.ts`) detect inter-page edges.
- Pages SHOULD link to at least one other page. Orphans are flagged by lint.
- Pages SHOULD NOT self-link. Self-links are forbidden by the cross-reference
  policy and filtered out by `findRelatedPages()`.
- Two special pages exist:
  - `index.md` — content catalog, one bullet per page, owned by
    `updateIndex()` in `src/lib/wiki.ts`. Do not hand-edit.
  - `log.md` — chronological activity log, append-only, owned by
    `appendToLog()` in `src/lib/wiki.ts`.
- Pages should not be edited by humans. The LLM owns the wiki layer; humans
  curate sources and ask questions.

## Operations

The wiki supports three core operations. Each has a defined trigger, an
ordered sequence of steps, a set of file outputs, and a log entry shape.

### Ingest

- **Trigger:** a URL or pasted text plus a title.
- **Steps:**
  1. If input is a URL, fetch and clean it (Readability + linkedom; see
     `fetchUrlContent()` in `src/lib/ingest.ts`).
  2. Save the cleaned content to `raw/<slug>.md` via `saveRawSource()`.
  3. Generate a wiki page (LLM if a key is configured, otherwise a deterministic
     fallback) and write it to `wiki/<slug>.md` via `writeWikiPage()`.
  4. Update `wiki/index.md` via `updateIndex()` — insert or refresh the entry
     for this slug.
  5. Find related pages by entity/keyword overlap with `findRelatedPages()`
     and append a cross-reference back to the new page on each one via
     `updateRelatedPages()`.
  6. Append a log entry via `appendToLog("ingest", title, …)`.
- **Outputs:** `raw/<slug>.md`, `wiki/<slug>.md`, `wiki/index.md`, possibly
  several `wiki/<other>.md` files (one per related page), and `wiki/log.md`.
- **Log entry:** `## [YYYY-MM-DD] ingest | <Title>`

### Query

- **Trigger:** a question (free-text).
- **Steps:**
  1. Read `wiki/index.md` to enumerate candidate pages.
  2. Score candidates with a keyword pass plus an LLM rank to find the most
     relevant slugs (`searchIndex()` in `src/lib/query.ts`).
  3. Fetch the full content of the top-ranked pages.
  4. Synthesize an answer with inline citations and return both the answer
     and the list of source slugs.
  5. If the user explicitly chooses to save the answer, the answer becomes a
     new wiki page via `saveAnswerToWiki()`.
- **Outputs:** none on the wiki by default. On save: a new `wiki/<slug>.md`,
  an `index.md` update, and a log entry.
- **Log entry (on save):** `## [YYYY-MM-DD] save | <Title>`

### Lint

- **Trigger:** explicit invocation (the `/lint` page or `POST /api/lint`).
- **Steps:**
  1. Scan every page in `wiki/` for orphans, stale pages, empty pages, and
     missing cross-references.
  2. Cluster pages that already cross-reference each other and ask the LLM
     to flag contradictions inside each cluster.
  3. Aggregate everything into a `LintResult` (see `src/lib/types.ts`).
- **Outputs:** a report only. Lint never mutates wiki files.
- **Log entry:** not currently emitted. See [Known gaps](#known-gaps).

## Cross-reference policy

- A "related" page is determined by entity/keyword overlap. The current
  detector is `findRelatedPages()` in `src/lib/ingest.ts` — it tokenizes the
  new page's content, scores every other page in the index, and returns the
  top matches above a threshold.
- When a new page is added, the related-page detector finds candidates and
  appends a `## Related` section (or extends an existing one) on each related
  page, linking back to the new page.
- Self-links are forbidden — `findRelatedPages()` excludes the new slug from
  its own candidate list.
- Existing cross-references are preserved. The updater only appends new links;
  it never rewrites or removes existing ones.

## Lint checks

Current checks performed by `lint()` in `src/lib/lint.ts`:

- **orphan** — page has no inbound `[...](slug.md)` links from any other page.
- **stale** — page has not been updated in a long time and may be out of date
  relative to newer ingests.
- **empty** — page is missing a summary, missing key sections, or otherwise
  too short to be useful.
- **missing-crossref** — page mentions a known entity (a slug present in the
  index) without linking to it.
- **contradictions** — pages within the same cross-referenced cluster make
  claims the LLM judges to be in tension. Requires an LLM key.

## Provider configuration

- The app talks to LLMs through the Vercel AI SDK (`ai` package). Set one of
  `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your environment. If both are
  set, Anthropic takes precedence.
- Override the default model with `LLM_MODEL` (e.g.
  `LLM_MODEL=claude-sonnet-4-20250514`).
- Without an API key configured, ingest still works in degraded mode: the raw
  source is saved and a deterministic fallback page is written. Query and
  lint LLM features return a "no LLM key configured" notice instead of an
  answer.

## Known gaps

Things this schema does NOT yet codify, in rough priority order. Future
sessions should pick from this list:

- No YAML frontmatter on wiki pages — no tags, dates, source counts, or
  Dataview-friendly metadata.
- No image or asset handling on URL ingest — images in source HTML are
  dropped.
- Lint does not append a log entry, so lint passes are invisible in the
  timeline.
- No vector search. The only search corpus is `index.md` plus the keyword/LLM
  rerank in `searchIndex()`.
- No raw-source browsing UI — users can't see the immutable layer through
  the app.
- Schema is not yet wired into runtime system prompts. Each operation has its
  own hardcoded prompt; this file is a parallel doc that has to be kept in
  sync by hand.
- No human-in-the-loop diff review on ingest — wiki writes happen
  immediately and silently.

## Co-evolution

This document is meant to be updated by yoyo as conventions emerge. When a
session adds a new lint check, a new page type, a new operation, or changes
how cross-references work, the schema should be updated in the same commit.
The running history of what changed and why lives in
[`.yoyo/journal.md`](.yoyo/journal.md), and project-specific learnings live
in [`.yoyo/learnings.md`](.yoyo/learnings.md). Treat this file as the
single source of truth for "how the wiki works today" — if it disagrees
with the code, fix one or the other in the same commit.
