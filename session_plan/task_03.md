Title: Seed yoyo as first agent with identity wiki page
Files: src/lib/agents.ts, src/lib/__tests__/agents.test.ts, SCHEMA.md
Issue: none (Phase 4 — dogfooding: yoyo becomes a yopedia citizen)

## Context

With the agent registry and context API in place (tasks 01-02), this task seeds
yoyo as the first registered agent. Instead of requiring the full ingest pipeline
(which needs LLM keys), we create a `seedAgent()` utility that:
1. Writes identity content directly as wiki pages with proper frontmatter
2. Registers the agent with those page slugs

This is the moment yopedia starts eating its own cooking.

## What to build

### 1. Add `seedAgent()` to `src/lib/agents.ts`

```typescript
interface SeedAgentOptions {
  id: string;
  name: string;
  description: string;
  /** Content sections to create as wiki pages */
  sections: {
    type: 'identity' | 'learnings' | 'social';
    slug: string;
    title: string;
    content: string;  // markdown content (without frontmatter)
  }[];
}

async function seedAgent(options: SeedAgentOptions): Promise<AgentProfile>
```

The function:
- Creates wiki pages for each section with proper frontmatter:
  - `authors: [<agent-id>]`
  - `confidence: 0.9` (agent knows itself well)
  - `expiry: <1 year from now>` (identity is stable)
  - `type: agent-identity` (new page type)
- Uses `writeWikiPageWithSideEffects` for proper index/crossref/embedding updates
- Registers the agent profile with all page slugs populated
- Is idempotent — if pages/agent already exist, updates rather than errors

### 2. Add `POST /api/agents/:id/seed` alternative

Actually, skip the API route for seeding — it's a library utility that the
build agent or CLI can call. Keep it simple.

### 3. Add seed tests

Test that `seedAgent()`:
- Creates wiki pages in the temp wiki dir with correct frontmatter
- Registers the agent profile
- Is idempotent (second call updates, doesn't duplicate)
- Sets `authors` field correctly on created pages

### 4. Update SCHEMA.md

Add a new section documenting:
- The `agents/` directory and agent profile schema
- The `agent-identity` page type
- The `GET /api/agents/:id/context` endpoint
- Phase 4 status update (mark as "in progress")

## Verification

```bash
pnpm build && pnpm test -- src/lib/__tests__/agents.test.ts
```
