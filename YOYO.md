# yopedia — A Wiki for the Agent Age

## What This Is

yopedia is a shared second brain for humans and agents. One knowledge substrate,
two surfaces over it. Evolved from the [LLM Wiki pattern](llm-wiki.md) —
Karpathy's idea for building persistent knowledge bases using LLMs.

This project was bootstrapped from a single founding prompt and grown entirely by
[yoyo](https://github.com/yologdev/yoyo), a self-evolving coding agent. Every
commit after the baseline tag was made by yoyo. The experiment proved that an
agent can grow a product from one prompt — 55 sessions, 33,600 lines, 1,242
tests, all four founding pillars complete. Now yopedia is the destination.

## The Vision

Read `yopedia-concept.md` for the full north star. The core ideas:

**Human surface: a wiki.** Markdown files with YAML frontmatter, wikilinks
between concepts, sources cited inline, confidence and expiry on every page.
Read in any markdown viewer. Trusted because every claim has a citation and a
confidence.

**Agent surface: an open question.** What's the right form of a wiki for agents?
Structured-claim graphs? Pre-computed embeddings? Fact triples? The same markdown
with a different parser? Treat this as a primary research question the product
answers over time.

**Not RAG.** RAG re-derives every query. yopedia accumulates — new sources
update existing pages, contradictions reconcile on talk pages, lineage is
preserved, what's stale visibly decays.

**Multi-user, multi-agent from day one.** Schema, trust model, conflict
resolution, attribution — all designed for many writers from the start.

## What Exists

The founding LLM Wiki vision is fully implemented:

| Pillar | Status |
|--------|--------|
| **Ingest** | URL fetch, text paste, batch multi-URL, chunking, image download, re-ingest |
| **Query** | BM25 + vector search (RRF fusion), streaming, citations, save-to-wiki |
| **Lint** | 7 checks + auto-fix (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page) |
| **Browse** | Index with sort/filter, dataview queries, graph view, backlinks, revision history, global search, Obsidian export |

Plus: CLI, Docker, dark mode, keyboard shortcuts, toast notifications, 1,242 tests.

## Current Direction — The yopedia Pivot

The founding vision is complete. Now evolve the product toward yopedia. Work
through these phases in order. Each phase builds on the last.

### Phase 1: Schema evolution

Extend frontmatter to support yopedia's richer page model:
- `confidence` (0–1) — how well-supported the page content is
- `expiry` (ISO date) — when the page should be reviewed for staleness
- `authors[]` — who created the page (agent or human handle)
- `contributors[]` — who has edited the page
- `sources[]` — array of `{type, url, fetched, triggered_by}` for provenance
- `disputed` (boolean) — whether the page has unresolved contradictions
- `supersedes` — slug of the page this one replaces
- `aliases[]` — alternative names (for redirects)

Migrate existing pages by adding sensible defaults. Don't break anything.
Update SCHEMA.md as you go. Add new lint checks: staleness (expiry past),
low-confidence, uncited claims.

### Phase 2: Talk pages + attribution

- Create `discuss/<slug>.md` directory for talk pages
- Talk page schema: linked to parent page, threaded, resolution status
- Attribution on revisions — who changed what and why
- Contributor profiles (JSON): trust score, edit count, revert rate
- UI: talk page tab on page view, contributor badges

### Phase 3: X ingestion loop

- @yoyo mention on X → research the source → write/revise the relevant page
- `type: x-mention` source provenance with triggering handle attributed
- Attribution trail from mention to page
- UI: source badges showing provenance type (URL, text, x-mention)

### Phase 4: Agent identity as yopedia pages (dogfooding)

- yoyo's IDENTITY.md, PERSONALITY.md, learnings, social wisdom become yopedia
  pages (`authors: [yoyo]`, proper schema)
- New API: `GET /api/agent/:id/context` — returns an agent's identity +
  learnings + social wisdom in one call
- Scoped search: `GET /api/search?scope=agent:yoyo` (personal) vs
  `GET /api/search` (global)
- grow.sh switches from "download yoyo-evolve tarball" to "query yopedia API
  for identity"
- Any project can bootstrap yoyo by hitting one endpoint — no repo coupling
- yoyo writes learnings back to yopedia after each session
- Other agents can onboard the same way — yopedia becomes the identity +
  knowledge layer for all agents

### Phase 5: Agent surface research

- Experiment with structured claims, fact triples, pre-computed embeddings
- Human wiki stays source of truth; agent surface is a projection
- Measure: does it improve query quality? Cross-wiki discovery?

## Open Research

These are questions the product answers over time, not assumptions to fix now:

- What is the right form of a knowledge artifact for an agent?
- How does trust accrue across humans and agents using the same metrics fairly?
- How do contradictions resolve when one side is human experience and the other
  is agent research?
- How does yopedia stay coherent as it scales past one community?
- What does federation across separate yopedia instances look like?

## Tech Stack

- **Runtime**: Node.js with pnpm
- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **LLM**: Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- **Testing**: vitest
- **Storage**: Local filesystem (markdown in `raw/`, `wiki/`, `discuss/`)
- **Search**: BM25 + optional embedding-based vector search with RRF fusion

## Build & Test

```sh
pnpm install
pnpm dev          # development server on :3000
pnpm build        # production build
pnpm lint         # eslint
pnpm test         # vitest
```

## Directory Structure

```
llm-wiki.md          # founding vision — spiritual ancestor (immutable)
yopedia-concept.md   # north star — the destination (immutable)
YOYO.md              # this file (project context)
SCHEMA.md            # wiki conventions and operations
src/                 # application source
  app/               # Next.js app router pages
  lib/               # core logic (ingest, query, lint)
  components/        # React components
raw/                 # user's source documents (gitignored)
wiki/                # LLM-maintained wiki output (gitignored)
discuss/             # talk pages for conflict resolution (future)
```

## How yoyo Works Here

- Each session: read the vision docs (yopedia-concept.md, llm-wiki.md), assess
  the codebase, identify gaps between vision and reality
- Decide what to build next based on the phased roadmap above
- Factor in GitHub issues labeled `agent-input` if they align — but the vision
  drives, issues steer
- Run `pnpm build && pnpm lint && pnpm test` after every change
- If builds break and can't be fixed in 3 attempts, revert
- Write session notes to `.yoyo/journal.md`
- Record project-specific learnings to `.yoyo/learnings.md`
- The git history IS the story — write clear commit messages
