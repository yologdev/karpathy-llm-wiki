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
- Pages SHOULD link to at least one other page.
- Pages SHOULD NOT self-link. Self-links are forbidden by the cross-reference
  policy and filtered out by `findRelatedPages()`.
- Two special pages exist:
  - `index.md` — content catalog, one bullet per page, owned by
    `updateIndex()` in `src/lib/wiki.ts`. Do not hand-edit.
  - `log.md` — chronological activity log, append-only, owned by
    `appendToLog()` in `src/lib/wiki.ts`.
- Pages should not be edited by humans. The LLM owns the wiki layer; humans
  curate sources and ask questions.

## Page templates

The wiki produces several distinct page types. Each type has a recommended
structure that the LLM should follow when generating pages. These templates
are available at runtime via `loadPageTemplates()` in `src/lib/schema.ts`.

### Source summary

Created by the **ingest** operation when a URL or text is added.

```yaml
---
type: summary
source_url: <original URL or "text-paste">
tags: [<topic1>, <topic2>]
---
```

```markdown
# <Title>

<One-paragraph summary of the source.>

## Key Points

- <Bullet 1>
- <Bullet 2>
- <Bullet 3>

## Details

<Longer prose expanding on the source content.>

## Sources

- [<raw source title>](../raw/<slug>.md)
```

### Entity page

About a specific person, organization, or tool.

```yaml
---
type: entity
tags: [<topic1>, <topic2>]
---
```

```markdown
# <Entity Name>

<One-paragraph summary of what this entity is and why it matters.>

## Overview

<Prose description — history, context, significance.>

## Key Facts

- **Founded:** <date or N/A>
- **Type:** <person | organization | tool | …>
- <other structured facts>

## Connections

- [<Related Entity>](related-entity.md)
- [<Related Concept>](related-concept.md)
```

### Concept page

About an idea, pattern, technique, or abstract topic.

```yaml
---
type: concept
tags: [<topic1>, <topic2>]
---
```

```markdown
# <Concept Name>

<One-paragraph summary defining the concept.>

## Definition

<Precise definition and context for when/where this concept applies.>

## Examples

- <Example 1 with brief explanation>
- <Example 2 with brief explanation>

## Related Concepts

- [<Related Concept>](related-concept.md)
- [<Related Entity>](related-entity.md)
```

### Comparison page

Created when a query answer that compares multiple items is saved to the wiki.

```yaml
---
type: comparison
tags: [<topic1>, <topic2>]
---
```

```markdown
# <Comparison Title>

<One-paragraph summary of what is being compared and the key takeaway.>

| Aspect   | <Item A> | <Item B> |
| -------- | -------- | -------- |
| <aspect> | <value>  | <value>  |

## Analysis

<Prose discussing the comparison in depth.>

## Sources

- [<wiki page cited>](cited-page.md)
```

## Operations

The wiki supports three core operations. Each has a defined trigger, an
ordered sequence of steps, a set of file outputs, and a log entry shape.

### Ingest

- **Trigger:** a URL or pasted text plus a title.
- **Steps:**
  1. If input is a URL, fetch and clean it (Readability + linkedom; see
     `fetchUrlContent()` in `src/lib/ingest.ts`).
  2. For URL ingests, download images referenced in the markdown content to
     `raw/assets/<slug>/` via `downloadImages()` in `src/lib/fetch.ts`. Image
     URLs are rewritten to local relative paths. At most 20 images per source;
     failures are logged but do not block the ingest. Text-paste ingests skip
     this step.
  3. Save the cleaned content to `raw/<slug>.md` via `saveRawSource()`.
  4. Generate a wiki page (LLM if a key is configured, otherwise a deterministic
     fallback) and write it to `wiki/<slug>.md` via `writeWikiPage()`.
  5. Update `wiki/index.md` via `updateIndex()` — insert or refresh the entry
     for this slug.
  6. Find related pages by entity/keyword overlap with `findRelatedPages()`
     and append a cross-reference back to the new page on each one via
     `updateRelatedPages()`.
  7. Append a log entry via `appendToLog("ingest", title, …)`.
- **Outputs:** `raw/<slug>.md`, `raw/assets/<slug>/*` (downloaded images),
  `wiki/<slug>.md`, `wiki/index.md`, possibly several `wiki/<other>.md` files
  (one per related page), and `wiki/log.md`.
- **Log entry:** `## [YYYY-MM-DD] ingest | <Title>`

### Query

- **Trigger:** a question (free-text).
- **Steps:**
  1. Read `wiki/index.md` to enumerate candidate pages.
  2. Score candidates with BM25 keyword scoring. When an embedding provider is
     configured (OpenAI, Google, or Ollama), also perform vector search and
     combine results via Reciprocal Rank Fusion (RRF). Optionally refine with
     an LLM rerank to find the most relevant slugs (`searchIndex()` in
     `src/lib/query.ts`).
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
- **Outputs:** a report only. Lint does not mutate content pages, but it does
  append a log entry to `wiki/log.md`.
- **Log entry:** `## [YYYY-MM-DD] lint | wiki lint pass` — appended on every
  run, with a one-line details body summarising issue counts
  (`N issue(s): X error · Y warning · Z info`).

## Cross-reference policy

- A "related" page is determined by entity/keyword overlap. The current
  detector is `findRelatedPages()` in `src/lib/wiki.ts` — it tokenizes the
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

- **`orphan-page`** (warning) — wiki page file exists on disk but is not
  listed in `index.md`. Auto-fix: add to index.
- **`stale-index`** (error) — entry exists in `index.md` but no corresponding
  `.md` file on disk. Auto-fix: remove from index.
- **`empty-page`** (warning) — page has fewer than 50 characters of content
  after stripping the H1 heading. Auto-fix: delete the page.
- **`broken-link`** (warning) — wiki links (`[text](slug.md)`) point to pages
  that don't exist on disk. Infrastructure files (`index.md`, `log.md`) are
  excluded. Auto-fix: remove the broken link(s) from the page.
- **`missing-crossref`** (info) — page mentions another page's title (3+ chars,
  word-boundary match) without linking to it. Auto-fix: append a cross-reference
  link to a `## Related` section.
- **`contradiction`** (warning) — LLM detects conflicting claims between pages
  in a cross-reference cluster (max 5 pages per cluster). Requires an LLM key.
  Auto-fix: call the LLM to rewrite the first page, resolving the conflicting
  claims while preserving content and structure.
- **`missing-concept-page`** (info) — LLM identifies important concepts
  mentioned across multiple wiki pages that don't have their own dedicated page.
  Requires an LLM key; skipped with an info message when no key is configured.
  Auto-fix: generate a stub concept page via the LLM (or a deterministic
  fallback).

## Provider configuration

- The app talks to LLMs through the Vercel AI SDK (`ai` package). Configure
  one of the following providers via environment variables. If multiple are
  set, the first match wins in this order:
  1. **Anthropic** — `ANTHROPIC_API_KEY` (default model: `claude-sonnet-4-20250514`)
  2. **OpenAI** — `OPENAI_API_KEY` (default model: `gpt-4o`)
  3. **Google Generative AI** — `GOOGLE_GENERATIVE_AI_API_KEY` (default model:
     `gemini-2.0-flash`)
  4. **Ollama** — `OLLAMA_BASE_URL` and/or `OLLAMA_MODEL`. Ollama is typically
     keyless; presence of either env var signals intent to use a local Ollama
     server (default model: `llama3.2`)
- Override the default model for whichever provider wins with `LLM_MODEL`
  (e.g. `LLM_MODEL=claude-sonnet-4-20250514`).
- Without any provider configured, ingest still works in degraded mode: the
  raw source is saved and a deterministic fallback page is written. Query and
  lint LLM features return a "no LLM key configured" notice instead of an
  answer.

## Known gaps

Things this schema does NOT yet codify, in rough priority order. Future
sessions should pick from this list:

- Vector search is partially implemented — embeddings are generated
  incrementally on page write (when an embedding-capable provider like OpenAI,
  Google, or Ollama is configured) and used for hybrid BM25+vector retrieval
  via RRF. Batch rebuild of the full vector index is available via the Settings
  page (`/api/settings/rebuild-embeddings`).
  Anthropic-only users see no regression (pure BM25 fallback).
- Lint auto-fix handles all seven checks (`orphan-page`, `stale-index`,
  `empty-page`, `broken-link`, `missing-crossref`, `contradiction`,
  `missing-concept-page`) via `POST /api/lint/fix`.
  The `contradiction` fix uses the LLM to rewrite the affected page.
  The `missing-concept-page` fix generates a stub page via the LLM.
  The `broken-link` fix removes broken links from the source page.
- Long documents are chunked at ingest time (12K chars per chunk ≈ 3K
  tokens) so they fit within provider context windows. Token counting is
  character-based (not tokenizer-exact), which is conservative but not
  precise.
- In-process file locking protects shared files (`index.md`, `log.md`,
  cross-references) from TOCTOU races within a single Next.js server process
  via `withFileLock()` in `src/lib/lock.ts`. This does NOT protect against
  multiple server processes (which would require OS-level lockfiles).

## Co-evolution

This document is meant to be updated by yoyo as conventions emerge. When a
session adds a new lint check, a new page type, a new operation, or changes
how cross-references work, the schema should be updated in the same commit.
The running history of what changed and why lives in
[`.yoyo/journal.md`](.yoyo/journal.md), and project-specific learnings live
in [`.yoyo/learnings.md`](.yoyo/learnings.md). Treat this file as the
single source of truth for "how the wiki works today" — if it disagrees
with the code, fix one or the other in the same commit.
