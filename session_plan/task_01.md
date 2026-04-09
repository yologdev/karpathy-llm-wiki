Title: Multi-provider LLM support (Google + Ollama)
Files: package.json, src/lib/llm.ts, src/lib/__tests__/llm.test.ts, README.md
Issue: none

## Problem

`YOYO.md` advertises "multi-provider via Vercel AI SDK — supports Anthropic, OpenAI, Google, Ollama, etc." but `src/lib/llm.ts` only wires up Anthropic and OpenAI. Users setting `GOOGLE_GENERATIVE_AI_API_KEY` or pointing at a local Ollama server get a confusing "No LLM API key found" error. This is the closest thing to a real bug in the codebase — the code contradicts its documented promise.

## Scope

Add Google Generative AI and Ollama as supported providers. Keep the change surgical — do not refactor the existing Anthropic/OpenAI paths unless necessary.

### 1. Install provider packages

```sh
pnpm add @ai-sdk/google ollama-ai-provider-v2
```

Notes:
- `@ai-sdk/google` is the official Vercel AI SDK package for Google Generative AI (Gemini).
- For Ollama, use `ollama-ai-provider-v2` — it's the maintained community package compatible with AI SDK v5 (the version this repo uses; check `package.json` for `ai` version first and pick the matching Ollama provider).
- If either package is incompatible with the installed `ai` version, document what you tried in the commit message and ship only the one that works. Do not downgrade `ai`.

### 2. Extend `src/lib/llm.ts`

Update `hasLLMKey()` to also return true when:
- `GOOGLE_GENERATIVE_AI_API_KEY` is set → Google provider.
- `OLLAMA_BASE_URL` is set (or a new `OLLAMA_MODEL` var) → Ollama provider. Ollama typically doesn't need an API key, so presence of the base URL is the signal. Default base URL on `http://localhost:11434/api` if only `OLLAMA_MODEL` is set is acceptable but NOT required — pick one convention and document it.

Update `getModel()` with the following priority order (first match wins):

1. Anthropic (`ANTHROPIC_API_KEY`)
2. OpenAI (`OPENAI_API_KEY`)
3. Google (`GOOGLE_GENERATIVE_AI_API_KEY`) → default model e.g. `gemini-2.0-flash` or `gemini-1.5-pro` (use whatever the current SDK README recommends as a sane default)
4. Ollama (`OLLAMA_BASE_URL` or `OLLAMA_MODEL`) → default model e.g. `llama3.2` (or whatever the provider README suggests)

`LLM_MODEL` continues to override the default model name for whichever provider wins.

Update the error message in `getModel()` to list all four env vars.

### 3. Tests

Extend `src/lib/__tests__/llm.test.ts`:
- `hasLLMKey()` returns true when only `GOOGLE_GENERATIVE_AI_API_KEY` is set.
- `hasLLMKey()` returns true when only the Ollama env var is set.
- `hasLLMKey()` returns false when no provider env var is set.
- The error message from `getModel()` (or a failing call) mentions all four provider env vars — use a regex or substring check so the test doesn't get too brittle.

Do NOT make real network calls to any provider. Mock at the same level as existing tests. Save/restore `process.env` around each test (look at existing test patterns in this file first).

### 4. Docs

Update `README.md` (or create an `LLM_PROVIDERS.md` if the README is already large) with a short "Supported LLM providers" section listing all four providers, the env var each one uses, and an example for each.

Also update `YOYO.md` only if an existing claim is now inaccurate — don't expand scope.

## Verification

```sh
pnpm install
pnpm build && pnpm lint && pnpm test
```

All must pass. The provider-detection tests should be deterministic (no live API calls).

## Out of scope

- No UI for picking a provider — this is env-var only, matching the existing architecture.
- No per-call provider override.
- No streaming — `callLLM` stays request/response.
- No refactor of `callLLM()` itself.
