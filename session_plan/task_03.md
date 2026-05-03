Title: Add MCP documentation to README and create mcp.json manifest
Files: README.md, mcp.json
Issue: none (assessment gap #7 — MCP discoverability)

## Context

The MCP server (src/mcp.ts, 515 lines, 7 tools after task_02) is a complete
read/write surface for external agents, but there's zero documentation about it.
The README doesn't mention MCP at all. There's no mcp.json manifest for agent
discovery. For a project that claims to be "a wiki for the agent age," the agent
interface being undiscoverable is a significant gap.

## What to build

### 1. README MCP section

Add a new section to README.md after the "How the Agent Works" section and before
any technical/setup sections. Title: "## Agent Interface (MCP)"

Content should cover:
- What it is: a Model Context Protocol server for external agents to read/write
  the wiki
- How to run it: `pnpm mcp` (stdio transport)
- Available tools (table):
  | Tool | Description | Read/Write |
  | search_wiki | Search wiki pages by query | Read |
  | read_page | Read a specific wiki page by slug | Read |
  | list_pages | List all wiki pages | Read |
  | create_page | Create a new wiki page | Write |
  | update_page | Update an existing wiki page | Write |
  | agent_context | Get an agent's full context | Read |
  | seed_agent | Register an agent with wiki pages | Write |
- Configuration example for Claude Desktop / Cursor (JSON snippet showing how
  to add yopedia as an MCP server):
  ```json
  {
    "mcpServers": {
      "yopedia": {
        "command": "npx",
        "args": ["tsx", "src/mcp.ts"],
        "cwd": "/path/to/karpathy-llm-wiki"
      }
    }
  }
  ```
- Brief note: "Any MCP-compatible client can connect. The server uses stdio
  transport."

### 2. mcp.json manifest

Create `mcp.json` at project root — a standard MCP server manifest:

```json
{
  "name": "yopedia",
  "version": "1.0.0",
  "description": "A wiki for the agent age — read and write knowledge pages via MCP",
  "transport": "stdio",
  "command": "npx",
  "args": ["tsx", "src/mcp.ts"],
  "tools": [
    "search_wiki",
    "read_page",
    "list_pages",
    "create_page",
    "update_page",
    "agent_context",
    "seed_agent"
  ]
}
```

### Implementation notes

- Keep the README section concise — developers should be able to set up MCP
  integration in under 2 minutes by reading it
- The mcp.json file is informational/discoverable — MCP clients may look for it
- Don't modify the existing README structure heavily — insert the MCP section
  in a natural position after the agent architecture explanation
- List 7 tools (including seed_agent from task_02). If task_02 hasn't landed
  yet, list 6 tools and the build agent for task_02 will update when it lands.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

(No new tests needed — this is documentation only. Verify the JSON is valid.)
