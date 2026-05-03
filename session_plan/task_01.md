Title: Add MCP write tools (create_page, update_page)
Files: src/mcp.ts, src/lib/__tests__/mcp.test.ts
Issue: none

## Context

The MCP server currently exposes 3 read-only tools (search_wiki, read_page,
list_pages). The competitive research scan identified write tools as
high-leverage: external agents can read our wiki but can't contribute to it.
This is the biggest gap preventing yopedia from being a truly collaborative
knowledge base for agents.

## What to build

Add two new MCP tools to `src/mcp.ts`:

### 1. `create_page`

- **Input schema**: `{ slug: string, content: string }` (content is markdown body)
- **Handler** (`handleCreatePage`): exported for testing
  - Call `validateSlug(slug)` from `./lib/wiki`
  - Call `readWikiPage(slug)` to check for conflicts (throw if exists)
  - Extract title from first `# Heading` in content, fallback to slug
  - Call `extractSummary()` for summary
  - Build frontmatter with `created: today`
  - Call `serializeFrontmatter(frontmatter, content)` to build full content
  - Call `writeWikiPageWithSideEffects()` with logOp "ingest"
  - Return `{ slug, title, created: true }`
- **MCP registration**: `readOnlyHint: false`, `openWorldHint: false`

### 2. `update_page`

- **Input schema**: `{ slug: string, content: string, author?: string }`
- **Handler** (`handleUpdatePage`): exported for testing
  - Call `readWikiPageWithFrontmatter(slug)` — throw "Page not found" if missing
  - Extract title from content's first `# Heading`, fallback to existing title
  - Call `extractSummary()` for summary
  - Merge existing frontmatter, bump `updated`, backfill `created` if missing
  - Call `serializeFrontmatter(merged, content)` to build full content
  - Call `writeWikiPageWithSideEffects()` with logOp "edit", author if provided
  - Return `{ slug, title, updated: true }`
- **MCP registration**: `readOnlyHint: false`, `openWorldHint: false`

### Imports needed

Add these imports to mcp.ts:
- `validateSlug` (already imported from `./lib/wiki`)
- `readWikiPage` — add to existing wiki import
- `writeWikiPageWithSideEffects` — add to existing wiki import (or import from lifecycle)
- `serializeFrontmatter` — add import
- `extractSummary` from `./lib/ingest`
- `Frontmatter` type

**Important**: Check where `writeWikiPageWithSideEffects` and `serializeFrontmatter`
are exported from. They may be re-exported from `./lib/wiki` or live in
`./lib/lifecycle` and `./lib/frontmatter` respectively. Follow the existing
import patterns in the API routes (`src/app/api/wiki/route.ts` imports them
from `@/lib/wiki`).

### Tests to add in `src/lib/__tests__/mcp.test.ts`

Add a new `describe("MCP write tools")` block:

1. **create_page — creates a new page**: call `handleCreatePage({ slug: "test-create", content: "# Test\n\nBody" })`, verify it returns slug + title + created, verify file exists on disk with frontmatter
2. **create_page — rejects duplicate slug**: create a page, call again with same slug, expect error
3. **create_page — rejects invalid slug**: pass an empty or invalid slug, expect error
4. **update_page — updates existing page**: create a page first, then call `handleUpdatePage({ slug, content: "# Updated\n\nNew body" })`, verify return includes updated: true, verify file on disk has new content
5. **update_page — 404 on missing page**: call update on nonexistent slug, expect error
6. **update_page — preserves frontmatter**: create page with specific frontmatter, update it, verify original frontmatter fields preserved and `updated` added
7. **update_page — author attribution**: update with author field, verify it flows through

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All existing MCP tests must continue passing. New tests must pass.
