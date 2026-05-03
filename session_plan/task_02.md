Title: Add seed_agent MCP tool for agent self-registration
Files: src/mcp.ts, src/lib/__tests__/mcp.test.ts
Issue: none (Phase 4 infrastructure — assessment gap #1)

## Context

The MCP server (src/mcp.ts) has 6 tools: search_wiki, read_page, list_pages,
create_page, update_page, agent_context. It has a read tool for agent context but
no write tool for agent self-registration. For Phase 4 ("any project can bootstrap
yoyo by hitting one endpoint — no repo coupling"), external agents need to be able
to seed themselves into yopedia through MCP.

## What to build

**seed_agent MCP tool** — accepts agent metadata and content sections, calls
`seedAgent()`, returns the registered profile.

### Tool definition

```typescript
server.registerTool("seed_agent", {
  description:
    "Register an agent and create its wiki pages (identity, learnings, social wisdom). Idempotent — re-seeding updates existing pages.",
  inputSchema: {
    agent_id: z.string().describe("Agent ID (lowercase alphanumeric + hyphens)"),
    name: z.string().describe("Agent display name"),
    description: z.string().describe("Short description of the agent"),
    sections: z.array(z.object({
      slug: z.string().describe("Wiki page slug for this section"),
      title: z.string().describe("Page title"),
      type: z.enum(["identity", "learnings", "social"]).describe("Section type"),
      content: z.string().describe("Markdown content for this section"),
    })).describe("Content sections to create as wiki pages"),
  },
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
  },
}, async (args) => { ... });
```

### Implementation notes

1. Add a `handleSeedAgent` function alongside the existing handlers at the top
   of mcp.ts (exported for testing)
2. Import `seedAgent` from `./lib/agents` (already imported path — check)
3. The handler calls `seedAgent()` with the args mapped to `SeedAgentOptions`
4. Returns the AgentProfile as JSON text
5. Error handling follows existing patterns (try/catch, isError flag)

### Tests

Add tests to `src/lib/__tests__/mcp.test.ts`:
- `handleSeedAgent` creates agent and returns profile
- `handleSeedAgent` with missing required field throws
- `handleSeedAgent` is idempotent (re-seeding updates)

Follow the existing test pattern in mcp.test.ts — the tests call the handler
functions directly, not through the MCP transport.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
