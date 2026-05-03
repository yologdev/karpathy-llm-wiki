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

### Yopedia frontmatter fields

In addition to the base fields (`type`, `source_url`, `tags`, `created`,
`updated`, `source_count`), every wiki page carries yopedia metadata fields.
These were added in Phase 1 of the yopedia pivot.

| Field | Type | Default | Set when | Consumed by |
|-------|------|---------|----------|-------------|
| `confidence` | number (0–1) | `0.7` | Initial ingest (deterministic default); preserved on re-ingest if existing value is higher | `low-confidence` lint check (flags pages below 0.3); future UI badge |
| `expiry` | ISO date string (YYYY-MM-DD) | 90 days from ingest | Initial ingest and re-ingest (always resets to 90 days from now) | `stale-page` lint check (flags pages past expiry); page view temporal range |
| `valid_from` | ISO date string (YYYY-MM-DD) | Today (ingest date) | Initial ingest and re-ingest (always resets to today — the content is re-verified) | `stale-page` lint check (flags pages verified over 180 days ago); page view temporal range ("Verified May 2026 · Review by Oct 2026") |
| `authors` | string array | `["system"]` | Initial ingest; preserved on re-ingest (never reset) | Future contributor profiles, attribution UI |
| `contributors` | string array | `[]` | Re-ingest appends `"system"` if not already present; manual edits should append the editor's handle | Future contributor profiles |
| `disputed` | boolean | `false` | Set manually or by future contradiction resolution; preserved on re-ingest | Future talk-page system, UI warning badge |
| `supersedes` | string (slug) | `""` (empty) | Set manually when a page replaces another; preserved on re-ingest | Future redirect system |
| `aliases` | string array | `[]` | Set manually for alternative names; preserved on re-ingest | Alias index for entity deduplication at ingest time; `duplicate-entity` lint check; search resolution |
| `sources` | JSON string (SourceEntry[]) | `"[]"` | Ingest appends a new entry; re-ingest appends if the source URL is new | Wiki page view provenance section; parseSources() in `src/lib/sources.ts` |

**Re-ingest behavior:** On re-ingest, `authors`, `contributors`, `disputed`,
`supersedes`, and `aliases` are preserved from the existing page. `expiry`
resets to 90 days from now and `valid_from` resets to today (the page is
considered refreshed and re-verified). `confidence` is preserved only if the
existing value is higher than the default 0.7 (indicating a manual upgrade).

**Temporal validity:** The `valid_from` field records WHEN the page's
information was last confirmed accurate — distinct from `updated` (when the
page was last edited) and `expiry` (when the page should next be reviewed).
Together, `valid_from` and `expiry` define a temporal validity window. The
page view displays this as "Verified May 2026 · Review by Oct 2026". The
`stale-page` lint check uses `valid_from` to flag pages verified more than
180 days ago, even if their expiry hasn't passed yet (info severity). This
is the page-level analog of Graphiti's `valid_at`/`invalid_at` model for
temporal knowledge management.

**Note:** The `authors` default is `"system"` (not `"yoyo"`) because the
ingest operation is performed by the system on behalf of the user. Phase 4
(agent identity) will introduce proper agent attribution.

**Sources format:** The `sources` field is a JSON-encoded string (since the
frontmatter parser rejects nested YAML objects) containing an array of
`SourceEntry` objects, each with `{type, url, fetched, triggered_by}`.
Types are `"url"` (fetched from a URL), `"text"` (pasted text), or
`"x-mention"` (triggered by an X/Twitter mention — Phase 3). Use
`parseSources()` and `serializeSources()` from `src/lib/sources.ts` to
read and write this field. The wiki page view displays structured sources
as provenance badges; falls back to showing flat `source_url` for legacy
pages.

**Alias resolution at ingest time:** The `aliases` field powers entity
deduplication. Before creating a new page, the ingest pipeline checks
the alias index (`src/lib/alias-index.ts`) for matches:
1. Slugified title matches an existing page's slug
2. Title (lowercased) matches a registered alias
3. Slugified title matches a slugified alias

If a match is found, the existing page is updated instead of creating a
duplicate. The alias index is an in-memory map rebuilt from page
frontmatter on demand and updated incrementally on page write. The
`duplicate-entity` lint check scans for pages whose titles/aliases
overlap (suggesting they should be merged).

## Talk pages (Phase 2)

Talk pages provide a threaded discussion surface for editorial disputes,
contradiction resolution, and general commentary on any wiki page.

**Location:** `discuss/<slug>.json` — created on demand by `ensureDiscussDir()`
in `src/lib/talk.ts`. The `discuss/` directory is gitignored (like `wiki/` and
`raw/`).

**Schema:** Each file contains a JSON array of `TalkThread` objects:

| Field | Type | Description |
|-------|------|-------------|
| `pageSlug` | string | Slug of the wiki page this thread discusses |
| `title` | string | Thread topic / title |
| `status` | `"open"` \| `"resolved"` \| `"wontfix"` | Resolution state |
| `created` | ISO date string | When the thread was created |
| `updated` | ISO date string | Last activity timestamp |
| `comments` | `TalkComment[]` | Ordered list of comments |

Each `TalkComment` has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID (timestamp-based, e.g. `"1714600000000"`) |
| `author` | string | Who wrote this comment (user handle or agent ID) |
| `created` | ISO date string | When the comment was posted |
| `body` | string | Markdown content |
| `parentId` | `string \| null` | ID of parent comment for threading; `null` for top-level |

**API routes:**

- `GET /api/wiki/:slug/discuss` — list all threads for a page
- `POST /api/wiki/:slug/discuss` — create a new thread
- `GET /api/wiki/:slug/discuss/:threadIndex` — get a single thread
- `PATCH /api/wiki/:slug/discuss/:threadIndex` — update thread status (resolve/reopen)
- `POST /api/wiki/:slug/discuss/:threadIndex/comments` — add a comment (supports `parentId` for replies)

**UI:** The wiki page view includes a "Discussion" tab showing threads with
nested reply rendering (indented comments up to 3 visual levels). Discussion
badge counts appear on wiki index page cards and individual page headers to
surface active disputes at a glance.

## Contributor profiles (Phase 2)

Contributor profiles aggregate activity from two data sources — revision
history and talk page discussions — to build a picture of each contributor's
involvement and trustworthiness.

**Built dynamically** by `buildContributorProfile()` and `listContributors()`
in `src/lib/contributors.ts`. No persistent storage; profiles are computed on
each request by scanning revisions and talk page JSON files.

**Trust score formula:**

```
trust = min(1, (editCount + commentCount) / 50) × (1 - min(0.5, revertCount × 0.1))
```

The first factor rewards activity volume (saturates at 50 contributions). The
second factor penalizes reverts — each revert reduces trust by 10%, capped at
a 50% reduction. A contributor with 100 edits and 0 reverts has trust 1.0; one
with 100 edits and 5 reverts has trust 0.5.

**Revert detection:** A revision counts as "reverted" when a subsequent revision
by a different author reduces content size by more than 50%.

**API routes:**

- `GET /api/contributors` — list all contributors, sorted by edit count
- `GET /api/contributors/:handle` — single contributor profile

**UI:** Contributor index page at `/wiki/contributors` lists all contributors
with trust badges. Detail pages at `/wiki/contributors/:handle` show full stats
(edit count, pages edited, comments, threads created, reverts if non-zero,
first/last seen dates). `ContributorBadge` components on wiki pages link through
to contributor detail pages.

## Revision attribution (Phase 2)

Revisions record who changed a wiki page and why. Stored as timestamped
markdown snapshots in `wiki/.revisions/<slug>/` with optional JSON sidecar
files for attribution metadata.

**File layout:**

```
wiki/.revisions/<slug>/
  <timestamp>.md          # Full page content at that point in time
  <timestamp>.meta.json   # Optional: {"author": "...", "reason": "..."}
```

The `.meta.json` sidecar is written by `saveRevision()` when `author` or
`reason` is provided. Legacy revisions (created before Phase 2) have no
sidecar and appear with `author: undefined` in the API — backward compatible.

**Revision fields:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | number | Unix timestamp in ms (also the filename stem) |
| `date` | ISO date string | For display |
| `slug` | string | Page this revision belongs to |
| `sizeBytes` | number | Byte length of the revision content |
| `author` | string (optional) | Who made this change |
| `reason` | string (optional) | Edit summary — why this change was made |

**API:** `GET /api/wiki/:slug/revisions` returns revision list;
`POST /api/wiki/:slug/revisions` creates a revision with author/reason.

## Agent registry (Phase 4)

Agents are registered entities in yopedia whose identity, learnings, and social
wisdom are stored as wiki pages. This is how yopedia "eats its own cooking" —
agents are yopedia citizens with proper attribution and provenance.

**Location:** `agents/<id>.json` — under the data directory (configured via
`DATA_DIR`). Each agent gets a JSON profile file, mirroring the `discuss/`
pattern for talk pages.

**Agent profile schema (`AgentProfile`):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique agent identifier, e.g. `"yoyo"`. Must match `/^[a-z0-9][a-z0-9-]*$/` |
| `name` | string | Display name |
| `description` | string | Short description of who this agent is |
| `identityPages` | `string[]` | Wiki page slugs forming the agent's identity context |
| `learningPages` | `string[]` | Wiki page slugs containing the agent's learnings |
| `socialPages` | `string[]` | Wiki page slugs containing social wisdom |
| `registered` | ISO date string | When the agent was first registered |
| `lastUpdated` | ISO date string | When the agent's context was last updated |

**The `agent-identity` page type:** Wiki pages created for agents use
`type: agent-identity` in their frontmatter. These pages have:
- `authors: [<agent-id>]` — the agent that owns the content
- `confidence: 0.9` — agents know themselves well
- `expiry: <1 year from now>` — identity is stable, reviewed annually
- `contributors: [<agent-id>]` — attribution

**Seeding:** The `seedAgent()` utility in `src/lib/agents.ts` creates wiki
pages for each section (identity, learnings, social) with proper frontmatter
and registers the agent profile in one idempotent call. It uses
`writeWikiPageWithSideEffects` for proper index, revision, and embedding
side effects.

**API routes:**

- `GET /api/agents` — list all registered agents
- `POST /api/agents` — register a new agent (body: `AgentProfile` fields)
- `GET /api/agents/:id` — get a single agent profile
- `DELETE /api/agents/:id` — remove an agent (does not delete wiki pages)
- `GET /api/agents/:id/context` — get the agent's full context (identity +
  learnings + social wisdom concatenated from wiki pages), designed for
  bootstrapping an agent's system prompt from yopedia

**Context endpoint response (`GET /api/agents/:id/context`):**

```json
{
  "agent": { "id": "yoyo", "name": "Yoyo", ... },
  "context": {
    "identity": "<concatenated identity page contents>",
    "learnings": "<concatenated learnings page contents>",
    "social": "<concatenated social page contents>"
  },
  "meta": {
    "pageCount": 3,
    "totalChars": 12500
  }
}
```

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
confidence: 0.7
expiry: <YYYY-MM-DD, 90 days from ingest>
authors: [system]
contributors: []
disputed: false
supersedes:
aliases: []
sources: <JSON array of {type, url, fetched, triggered_by}>
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
confidence: 0.7
expiry: <YYYY-MM-DD, 90 days from ingest>
authors: [system]
contributors: []
disputed: false
supersedes:
aliases: []
sources: <JSON array of {type, url, fetched, triggered_by}>
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

### Agent identity page

Created by `seedAgent()` for agent self-documentation. These pages store an
agent's identity, learnings, or social wisdom as first-class wiki content.

```yaml
---
type: agent-identity
authors: [<agent-id>]
confidence: 0.9
expiry: <YYYY-MM-DD, 1 year from creation>
created: <ISO date>
updated: <ISO date>
contributors: [<agent-id>]
---
```

```markdown
# <Agent Name> <Section>

<Content describing the agent's identity, learnings, or social wisdom.>
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
- **`stale-page`** (warning) — page's `expiry` frontmatter date is in the
  past, meaning the content may be outdated and should be reviewed or
  re-ingested. No auto-fix — requires human or agent judgment to refresh
  or extend the expiry.
- **`low-confidence`** (info) — page's `confidence` frontmatter value is
  below 0.3 (`LOW_CONFIDENCE_THRESHOLD` in `src/lib/lint-checks.ts`),
  indicating the page needs more supporting sources. No auto-fix — requires
  ingesting additional sources to improve confidence.
- **`duplicate-entity`** (warning) — two pages have overlapping titles or
  aliases, suggesting they may be about the same concept. The `target` field
  contains the slug of the other page. No auto-fix — requires human judgment
  to merge pages and update aliases.

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
- Lint auto-fix handles eight of nine checks (`orphan-page`, `stale-index`,
  `empty-page`, `broken-link`, `missing-crossref`, `contradiction`,
  `missing-concept-page`, `stale-page`) via `POST /api/lint/fix`.
  The `contradiction` fix uses the LLM to rewrite the affected page.
  The `missing-concept-page` fix generates a stub page via the LLM.
  The `broken-link` fix removes broken links from the source page.
  The `stale-page` fix bumps the expiry date forward by 90 days and
  refreshes `valid_from` to today.
  The sole exception is `low-confidence`, which has no auto-fix by design —
  raising confidence requires ingesting additional sources, not rewriting
  what's already there.
- Long documents are chunked at ingest time (12K chars per chunk ≈ 3K
  tokens) so they fit within provider context windows. Token counting is
  character-based (not tokenizer-exact), which is conservative but not
  precise.
- In-process file locking protects shared files (`index.md`, `log.md`,
  cross-references) from TOCTOU races within a single Next.js server process
  via `withFileLock()` in `src/lib/lock.ts`. This does NOT protect against
  multiple server processes (which would require OS-level lockfiles).
- The wiki page view displays yopedia metadata fields (`confidence`,
  `expiry`, `valid_from`, `authors`, `contributors`, `disputed`, `aliases`,
  `supersedes`, `sources`) when present. Confidence is color-coded
  (green/yellow/red), temporal validity shows as "Verified May 2026 ·
  Review by Oct 2026" (or an amber warning when expired), disputed pages
  get an orange badge and explanation text, aliases render as muted "Also
  known as" text, supersedes links to the replaced page, and structured
  sources display as a provenance section with type badges (URL/Text/𝕏
  Mention), clickable URLs, fetch dates, and triggered-by attribution.
  Falls back to showing flat `source_url` for legacy pages without
  structured `sources`.

## Planned evolution

Phase 1 (schema evolution) and Phase 2 (talk pages + attribution) are complete.
Phase 4 (agent identity as yopedia pages) is **in progress** — the agent
registry, context API, `seedAgent()` utility, and `agent-identity` page type
are implemented. Remaining Phase 4 work: migrating yoyo's actual identity
content into yopedia pages, scoped search, and grow.sh integration.
The schema will continue to evolve toward the full yopedia model defined in
[`yopedia-concept.md`](yopedia-concept.md). See YOYO.md for the phased roadmap.
Next up: Phase 3 (X ingestion loop) and Phase 5 (agent surface research).
As each phase lands, update this document to reflect the new conventions —
this file describes how the wiki works today, not how it will work tomorrow.

## Co-evolution

This document is meant to be updated by yoyo as conventions emerge. When a
session adds a new lint check, a new page type, a new operation, or changes
how cross-references work, the schema should be updated in the same commit.
The running history of what changed and why lives in
[`.yoyo/journal.md`](.yoyo/journal.md), and project-specific learnings live
in [`.yoyo/learnings.md`](.yoyo/learnings.md). Treat this file as the
single source of truth for "how the wiki works today" — if it disagrees
with the code, fix one or the other in the same commit.
