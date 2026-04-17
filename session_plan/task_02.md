Title: Settings page — extract useSettings hook
Files: src/app/settings/page.tsx, src/hooks/useSettings.ts
Issue: none

The settings page at 402 lines mixes data fetching, mutation logic, and UI
rendering in one component. The fetch/save/test plumbing accounts for ~180 lines
that can be cleanly extracted into a `useSettings` custom hook.

## useSettings hook (~180 lines)

Create `src/hooks/useSettings.ts` containing all the imperative state management
currently in `SettingsPage`:

### State it owns:
- `settings: EffectiveSettings | null` — fetched settings from API
- `status: ProviderStatus | null` — provider status from API
- `loadError: string | null` — fetch error
- Form values: `provider`, `apiKey`, `model`, `ollamaBaseUrl`, `embeddingModel`
- UI state: `saving`, `saveResult`, `testing`, `testResult`, `rebuilding`, `rebuildResult`

### Functions it exposes:
- `fetchSettings()` — GET /api/settings, populate settings + pre-fill form
- `fetchStatus()` — GET /api/status, populate status
- `handleSave(e: FormEvent)` — PUT /api/settings with form values
- `handleTest()` — POST /api/query with test payload
- `handleRebuildEmbeddings()` — POST /api/settings/rebuild-embeddings
- Form setters: `setProvider`, `setApiKey`, `setModel`, `setOllamaBaseUrl`, `setEmbeddingModel`

### Return type:
```ts
interface UseSettingsReturn {
  // Fetched data
  settings: EffectiveSettings | null;
  status: ProviderStatus | null;
  loadError: string | null;
  // Form values
  provider: string;
  apiKey: string;
  model: string;
  ollamaBaseUrl: string;
  embeddingModel: string;
  // Form setters
  setProvider: (v: string) => void;
  setApiKey: (v: string) => void;
  setModel: (v: string) => void;
  setOllamaBaseUrl: (v: string) => void;
  setEmbeddingModel: (v: string) => void;
  // Actions
  handleSave: (e: FormEvent) => Promise<void>;
  handleTest: () => Promise<void>;
  handleRebuildEmbeddings: () => Promise<void>;
  // Action state
  saving: boolean;
  saveResult: { ok: boolean; message: string } | null;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  rebuilding: boolean;
  rebuildResult: { ok: boolean; message: string } | null;
}
```

Move the `EffectiveSettings` and `ProviderStatus` interfaces into the hook file
(they're only used by settings).

The settings page should shrink to ~220 lines: pure JSX layout that calls
`useSettings()` and passes values to `ProviderForm` and `EmbeddingSettings`.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

No new tests needed — pure extraction with no behavior change.
