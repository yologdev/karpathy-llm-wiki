Title: Settings status API and home page provider indicator
Files: src/app/api/status/route.ts, src/app/page.tsx, src/lib/llm.ts
Issue: none

## Description

Users currently have zero visibility into whether an LLM provider is configured, which provider is active, or what model is being used. They only discover misconfiguration when ingest/query fails. This is the biggest barrier to the "anyone can use it" goal (assessment gap #1, bug #2).

### 1. Add `getProviderInfo()` to `src/lib/llm.ts`

Export a new function that returns the active provider status without making any API calls:

```typescript
export interface ProviderInfo {
  configured: boolean;        // true if any provider key is set
  provider: string | null;    // "anthropic" | "openai" | "google" | "ollama" | null
  model: string | null;       // resolved model name (including LLM_MODEL override)
  embeddingSupport: boolean;  // true if the active provider supports embeddings
}

export function getProviderInfo(): ProviderInfo { ... }
```

Logic: mirrors the existing `hasLLMKey()` and `getModel()` priority chain but returns metadata instead of constructing a model instance. Use `hasEmbeddingSupport()` from embeddings.ts for the embedding field.

### 2. Create `GET /api/status` route at `src/app/api/status/route.ts`

Simple route that calls `getProviderInfo()` and returns it as JSON. No auth needed — this only reveals provider type and model name, never API keys.

```typescript
export async function GET() {
  const info = getProviderInfo();
  return Response.json(info);
}
```

### 3. Update home page (`src/app/page.tsx`) to show provider status

Add a status badge below the hero text on the home page. Fetch `/api/status` client-side on mount (or use a small client component embedded in the server page).

- **If configured:** Show a green dot + "Connected: Anthropic (claude-sonnet-4-20250514)" (or whatever provider/model)
- **If not configured:** Show an amber dot + "No LLM provider configured — set an API key in your environment" with a collapsible help section showing the env var names from SCHEMA.md

The home page is currently a server component. Convert it to client or add a small `StatusBadge` client component that the server page renders. Keep it simple — a single `useEffect` fetch.

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

The new API route should build cleanly. No new test file needed for this task (the route is trivial), but ensure existing tests still pass.
