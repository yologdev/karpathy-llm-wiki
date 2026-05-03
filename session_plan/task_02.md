Title: Agent context API endpoint
Files: src/app/api/agents/[id]/context/route.ts, src/app/api/agents/[id]/route.ts, src/app/api/agents/route.ts, src/lib/__tests__/agents.test.ts
Issue: none (Phase 4 — the flagship API from YOYO.md)

## Context

YOYO.md Phase 4 specifies: "New API: `GET /api/agent/:id/context` — returns an
agent's identity + learnings + social wisdom in one call." This is the endpoint
that lets any project bootstrap an agent by hitting one URL — no repo coupling.

This task creates three API routes:

## What to build

### 1. `GET /api/agents` — List all registered agents

Route: `src/app/api/agents/route.ts`

```typescript
// GET /api/agents → { agents: AgentProfile[] }
// POST /api/agents → register a new agent (body: AgentProfile fields)
```

- GET returns `{ agents: AgentProfile[] }` from `listAgents()`
- POST validates body, calls `registerAgent()`, returns 201 with the profile
- POST returns 400 for invalid input, 409 if agent already exists

### 2. `GET /api/agents/:id` — Get a single agent profile

Route: `src/app/api/agents/[id]/route.ts`

- GET returns `{ agent: AgentProfile }` or 404
- DELETE removes the agent, returns 200 or 404

### 3. `GET /api/agents/:id/context` — The flagship context endpoint

Route: `src/app/api/agents/[id]/context/route.ts`

This is the key endpoint. It:
1. Loads the agent profile via `getAgent(id)`
2. Reads all wiki pages referenced in `identityPages`, `learningPages`, `socialPages`
3. Returns a structured context object:

```typescript
{
  agent: AgentProfile,
  context: {
    identity: string,      // concatenated content of identity pages
    learnings: string,     // concatenated content of learning pages
    socialWisdom: string,  // concatenated content of social pages
  },
  meta: {
    totalChars: number,
    pageCount: number,
    generatedAt: string,   // ISO timestamp
  }
}
```

- Returns 404 if agent not found
- Gracefully handles missing wiki pages (skips them, logs warning)
- Each section concatenates pages with `\n\n---\n\n` separator

### 4. Add API route tests to agents test file

Add integration-style tests that verify:
- GET /api/agents returns empty list initially
- POST + GET round-trip works
- GET /api/agents/:id/context returns 404 for unknown agent
- Context endpoint aggregates page content correctly (mock wiki pages via temp dir)

## Verification

```bash
pnpm build && pnpm test -- src/lib/__tests__/agents.test.ts
```
