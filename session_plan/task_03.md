Title: Ingest API route and basic browse page
Files: src/lib/ingest.ts, src/app/api/ingest/route.ts, src/app/wiki/page.tsx, src/app/wiki/[slug]/page.tsx
Issue: #1

## Description

Wire up the ingest pipeline and create a minimal browse UI. This connects the core library to the web layer.

### Depends on
Task 01 and Task 02 must be completed first.

### Files to create

#### `src/lib/ingest.ts`
The ingest pipeline that ties wiki.ts and llm.ts together.

Function:
- `ingest(title: string, content: string): Promise<IngestResult>` — the main entry point
  1. Generate a slug from the title (lowercase, hyphens, no special chars)
  2. Call `saveRawSource(slug, content)` to save the raw source
  3. Call `callLLM()` with a system prompt that instructs the LLM to:
     - Read the provided content
     - Generate a wiki article in markdown format
     - Include a title (# heading), summary, key points, and any entities/concepts worth noting
     - The response should be pure markdown, nothing else
  4. Call `writeWikiPage(slug, llmResponse)` to save the generated wiki page
  5. Read current index via `listWikiPages()`, add new entry, call `updateIndex()`
  6. Call `appendToLog()` with ingest record
  7. Return `IngestResult`

If `ANTHROPIC_API_KEY` is not set, use a **fallback stub**: generate a simple wiki page from the raw content without calling the LLM. This allows the app to work (in degraded mode) without an API key. Format: `# {title}\n\n## Summary\n\n{first 200 chars of content}...\n\n## Raw Content\n\n{content}`

#### `src/app/api/ingest/route.ts`
Next.js API route handler:
- `POST /api/ingest` — accepts JSON body `{ title: string, content: string }`
- Validates inputs (title and content required, both non-empty strings)
- Calls `ingest(title, content)`
- Returns JSON response with the result
- Returns 400 for bad input, 500 for server errors

#### `src/app/wiki/page.tsx`
Browse page that shows the wiki index:
- Server component that reads `wiki/index.md` via `listWikiPages()`
- Renders a list of wiki pages as links to `/wiki/{slug}`
- If no pages exist, show a friendly "No wiki pages yet. Ingest some content to get started!" message
- Simple, clean Tailwind styling

#### `src/app/wiki/[slug]/page.tsx`
Individual wiki page viewer:
- Server component that reads the wiki page via `readWikiPage(slug)`
- Renders the raw markdown as HTML. For now, just display in a `<pre>` tag or use a simple whitespace-pre-wrap div. (Proper markdown rendering can come later.)
- If page not found, show 404 message
- Include a "← Back to index" link

### Verify
```sh
pnpm build && pnpm lint && pnpm test
```
Build must pass. The browse page should render at `/wiki`. The API route should be callable (verify with curl if possible during build, but mainly ensure `pnpm build` succeeds).

### Notes
- All server components — no client-side JavaScript needed for browse
- The ingest API route is the only POST endpoint
- The landing page (from task 01) should link to `/wiki` for browsing
- Keep styling minimal but functional — this is a foundation to iterate on
