// ---------------------------------------------------------------------------
// Provider / model constants — single source of truth
// ---------------------------------------------------------------------------
// This file is intentionally free of Node.js imports (fs, path, etc.) so it
// can be safely imported from both server code (config.ts, llm.ts) and
// "use client" components (settings page, StatusBadge, etc.).
// ---------------------------------------------------------------------------

/**
 * Canonical list of supported LLM providers with display labels.
 */
export const PROVIDER_INFO = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
] as const;

/** Union type of valid provider values. */
export type ProviderValue = (typeof PROVIDER_INFO)[number]["value"];

/**
 * Set of valid provider strings, derived from PROVIDER_INFO.
 */
export const VALID_PROVIDERS: ReadonlySet<string> = new Set(
  PROVIDER_INFO.map((p) => p.value),
);

/**
 * Providers capable of producing embeddings. This is a different set from the
 * LLM providers: it adds `workers-ai` (Cloudflare bge-m3) and excludes
 * `anthropic`/`deepseek` (no embedding models). Kept as a single source of
 * truth so the runtime check and the config type can't drift.
 */
export const EMBEDDING_PROVIDERS = [
  "openai",
  "google",
  "ollama",
  "workers-ai",
] as const;

/** Union of valid embedding-provider values. */
export type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number];

/** Type guard narrowing an arbitrary string to {@link EmbeddingProvider}. */
export function isEmbeddingProvider(p: string): p is EmbeddingProvider {
  return (EMBEDDING_PROVIDERS as readonly string[]).includes(p);
}

/**
 * Default model for each provider.
 */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  deepseek: "deepseek-v4-flash",
  ollama: "llama3.2",
};

/**
 * Get a human-readable label for a provider value.
 * Falls back to the raw string if the provider is unknown.
 */
export function providerLabel(provider: string): string {
  const entry = PROVIDER_INFO.find((p) => p.value === provider);
  return entry?.label ?? provider;
}
