Title: Add MCP server with read-only tools (search_wiki, read_page, list_pages)
Files: src/mcp.ts, package.json, src/lib/__tests__/mcp.test.ts
Issue: #26

## Context

Issue #26 (in-progress by build agent on branch) identifies exposing yopedia as
an MCP server as the highest-leverage gap. MCP is the universal agent interface
(85K+ stars). Without it, agents bypass yopedia for tools that have MCP support.

A build agent claimed this issue but no code has landed on main. This task scopes
to the minimal useful MCP surface: **read-only tools only**. Write tools (ingest,
create_page, discuss) can follow in a later session.

## What to build

### 1. Install MCP SDK

```bash
pnpm add @modelcontextprotocol/sdk zod
```

(zod is needed for tool input schemas; check if already installed first)

### 2. Create `src/mcp.ts` — MCP server entry point

A standalone server file that:
- Creates an MCP server via `@modelcontextprotocol/sdk`
- Uses stdio transport (simplest, works with Claude Desktop and other MCP clients)
- Registers 3 read-only tools:

**`search_wiki`** — Search wiki pages
- Input: `{ query: string, limit?: number }` (zod schema)
- Implementation: calls `searchWikiContent()` from `src/lib/search.ts`
- Returns: array of `{ slug, title, snippet, score }`

**`read_page`** — Read a single wiki page
- Input: `{ slug: string }`
- Implementation: calls `readWikiPage()` from `src/lib/wiki.ts`
- Returns: page content (markdown) with frontmatter as structured metadata

**`list_pages`** — List all wiki pages
- Input: `{ sort?: "title" | "updated" | "confidence", limit?: number }`
- Implementation: calls `listWikiPages()` from `src/lib/wiki.ts`
- Returns: array of `{ slug, title, tags, confidence, updated }`

### 3. Add `pnpm mcp` script to package.json

```json
"mcp": "tsx src/mcp.ts"
```

### 4. Add tests in `src/lib/__tests__/mcp.test.ts`

Test the MCP server tool handlers directly (not via transport):
- search_wiki returns results for matching content
- search_wiki returns empty for no matches
- read_page returns page content
- read_page throws for nonexistent slug
- list_pages returns all pages
- list_pages respects limit parameter

Use temp directories for wiki content (same pattern as wiki.test.ts).

## Key decisions

- **stdio transport only** — SSE/HTTP transport is useful but adds complexity.
  stdio works with Claude Desktop, Cursor, and most MCP clients.
- **Read-only only** — Write tools need more careful design (attribution,
  validation, conflict resolution). Ship read-only first to get yopedia
  discoverable by agents.
- **Tool handlers call existing library functions** — No duplicating logic.
  The MCP layer is purely a new surface over existing capabilities.

## Verification

```bash
pnpm build && pnpm lint && pnpm test
# Verify MCP server starts:
echo '{}' | timeout 2 pnpm mcp 2>&1 || true  # should exit cleanly, not crash
```
