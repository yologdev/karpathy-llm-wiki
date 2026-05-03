Title: Add agent_context tool to MCP server
Files: src/mcp.ts, src/lib/__tests__/mcp.test.ts
Issue: none

## Context

Phase 4's vision: "any project can bootstrap yoyo by hitting one endpoint."
The `GET /api/agents/:id/context` REST endpoint already exists and works.
Exposing it as an MCP tool means any agent connected via MCP can query
another agent's identity, learnings, and social wisdom — without needing
HTTP access. This bridges Phase 4 (agent identity) with the MCP server.

## What to build

### 1. `agent_context` MCP tool

- **Input schema**: `{ agent_id: string }`
- **Handler** (`handleAgentContext`): exported for testing
  - Import `getAgent` from `./lib/agents`
  - Import `readWikiPage` (already imported from `./lib/wiki`)
  - Call `getAgent(agent_id)` — throw "Agent not found" if null
  - Load identity, learnings, and social pages by calling `readWikiPage()`
    for each slug in `agent.identityPages`, `agent.learningPages`,
    `agent.socialPages`
  - Concatenate page contents with `\n\n---\n\n` separator (same pattern
    as the API route)
  - Return:
    ```json
    {
      "agent": { "id": "...", "name": "...", "description": "..." },
      "context": {
        "identity": "...",
        "learnings": "...",
        "socialWisdom": "..."
      },
      "meta": {
        "totalChars": 1234,
        "pageCount": 3
      }
    }
    ```
- **MCP registration**: `readOnlyHint: true`, `openWorldHint: false`
- **Description**: "Get an agent's full context (identity, learnings, social wisdom) by agent ID"

### Imports to add

- `getAgent` from `./lib/agents`
- `readWikiPage` is already imported from `./lib/wiki`

### Tests to add in `src/lib/__tests__/mcp.test.ts`

Add a `describe("agent_context tool")` block:

1. **returns agent context**: Register an agent (write agent JSON to agents
   dir), create wiki pages for its identity/learning/social page slugs, call
   `handleAgentContext({ agent_id: "test-agent" })`, verify returned object
   has agent info + context sections with page content
2. **throws for unknown agent**: Call with nonexistent agent_id, expect error
3. **handles missing wiki pages gracefully**: Register agent with page slugs
   that don't exist on disk, verify it returns empty strings for those sections
   (not crash)

For test setup: the existing `beforeEach` creates tmpDir and sets WIKI_DIR.
The agent tests will also need to set `AGENTS_DIR` or `DATA_DIR` environment
variable. Check how `src/lib/__tests__/agents.test.ts` sets up its test
environment and follow the same pattern.

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All existing MCP tests must continue passing. New tests must pass.
