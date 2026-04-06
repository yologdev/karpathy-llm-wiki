# Karpathy LLM Wiki

## What This Is

An implementation of the [LLM Wiki pattern](llm-wiki.md) — Karpathy's idea for building personal knowledge bases using LLMs. Instead of RAG, the LLM incrementally builds and maintains a persistent wiki of interlinked markdown files.

This project was bootstrapped from a single founding prompt and is being grown entirely by [yoyo](https://github.com/yologdev/yoyo), a self-evolving coding agent. Every commit after the baseline tag was made by yoyo, triggered by GitHub issues.

## Founding Vision

Read `llm-wiki.md` for the complete pattern description. The core architecture:

- **Raw sources** — immutable source documents (articles, papers, notes)
- **The wiki** — LLM-generated markdown files (summaries, entity pages, cross-references)
- **The schema** — conventions and workflows for maintaining the wiki

Three operations: **ingest** (add sources → update wiki), **query** (ask questions → get cited answers), **lint** (health-check the wiki).

## Current Direction

Build a **web application** that lets anyone create and maintain their own LLM wiki. The app should implement:

1. **Ingest** — paste a URL or text, the app processes it into the wiki
2. **Query** — ask questions against your wiki, get cited answers from wiki pages
3. **Lint** — health-check the wiki (contradictions, orphan pages, missing cross-references)
4. **Browse** — navigate the wiki with an index, cross-references, and graph view

### Open Questions (community decides via issues)

- Web app vs Obsidian plugin vs CLI tool vs all three?
- Which LLM provider(s) to support? (Start with Anthropic Claude API)
- Local-first vs cloud-hosted? (Start local-first)
- Auth and multi-user support?

## Tech Stack

Start simple, iterate:

- **Runtime**: Node.js with pnpm
- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **LLM**: Multi-provider via Vercel AI SDK (`ai` package) — supports Anthropic, OpenAI, Google, Ollama, etc. Users pick their provider and API key at deploy time via environment variables
- **Testing**: vitest
- **Storage**: Local filesystem (markdown files in `raw/` and `wiki/`)
- **Search**: Start with index.md scanning, add vector search later

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
llm-wiki.md          # founding vision (immutable — do not modify)
YOYO.md              # this file (project context)
src/                 # application source
  app/               # Next.js app router pages
  lib/               # core logic (ingest, query, lint)
  components/        # React components
raw/                 # user's source documents (gitignored)
wiki/                # LLM-maintained wiki output (gitignored)
```

## How yoyo Works Here

- Each session: read the founding vision (llm-wiki.md), assess the codebase, identify gaps
- Decide what to build next based on the biggest gap between vision and reality
- Factor in GitHub issues labeled `agent-input` if they align with the vision — but the vision drives
- Run `pnpm build && pnpm lint && pnpm test` after every change
- If builds break and can't be fixed in 3 attempts, revert
- Write session notes to `.yoyo/journal.md`
- Record project-specific learnings to `.yoyo/learnings.md`
- The git history IS the story — write clear commit messages
