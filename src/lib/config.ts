import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import type { ProviderInfo } from "./types";
import { hasEmbeddingSupport } from "./embeddings";
import { isEnoent } from "./errors";
import { VALID_PROVIDERS, DEFAULT_MODELS } from "./providers";

// Re-export provider constants so existing consumers can import from config
export { PROVIDER_INFO, VALID_PROVIDERS, DEFAULT_MODELS, providerLabel } from "./providers";
export type { ProviderValue } from "./providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppConfig {
  provider?: "anthropic" | "openai" | "google" | "ollama";
  apiKey?: string;
  model?: string;
  ollamaBaseUrl?: string;
  embeddingModel?: string;
}

/** Describes where each setting was resolved from. */
export type SettingSource = "env" | "config" | "default" | "none";

export interface EffectiveSettings {
  provider: string | null;
  providerSource: SettingSource;
  model: string | null;
  modelSource: SettingSource;
  configured: boolean;
  embeddingSupport: boolean;
  embeddingModel: string | null;
  embeddingModelSource: SettingSource;
  maskedApiKey: string | null;
  apiKeySource: SettingSource;
  ollamaBaseUrl: string | null;
  ollamaBaseUrlSource: SettingSource;
}

// ---------------------------------------------------------------------------
// Valid providers (for validation)
// ---------------------------------------------------------------------------

export function isValidProvider(p: string): p is AppConfig["provider"] & string {
  return VALID_PROVIDERS.has(p);
}

// ---------------------------------------------------------------------------
// Config file path
// ---------------------------------------------------------------------------

export function getConfigPath(): string {
  const base = process.env.DATA_DIR ?? process.cwd();
  return path.join(base, ".llm-wiki-config.json");
}

// ---------------------------------------------------------------------------
// Async config I/O
// ---------------------------------------------------------------------------

/**
 * Read and parse the config file. Returns `{}` if the file doesn't exist.
 */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch (err) {
    if (!isEnoent(err)) {
      console.warn("[config] load config failed:", err);
    }
    return {};
  }
}

/**
 * Write config JSON atomically (write tmp → rename).
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const tmp = configPath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, configPath);
  // Invalidate the sync cache so subsequent reads see the new data
  _configCache = null;
}

// ---------------------------------------------------------------------------
// Sync cached reads (for hot-path in llm.ts)
// ---------------------------------------------------------------------------

let _configCache: { data: AppConfig; ts: number } | null = null;
const CACHE_TTL_MS = 5_000;

/**
 * Synchronous config read with in-memory cache (5 s TTL).
 * Returns `{}` on any error.
 */
export function loadConfigSync(): AppConfig {
  const now = Date.now();
  if (_configCache && now - _configCache.ts < CACHE_TTL_MS) {
    return _configCache.data;
  }
  try {
    const raw = fsSync.readFileSync(getConfigPath(), "utf-8");
    const data = JSON.parse(raw) as AppConfig;
    _configCache = { data, ts: now };
    return data;
  } catch (err) {
    if (!isEnoent(err)) {
      console.warn("[config] load config (sync) failed:", err);
    }
    _configCache = { data: {}, ts: now };
    return {};
  }
}

/** Expose cache reset for testing. */
export function _resetConfigCache(): void {
  _configCache = null;
}

// ---------------------------------------------------------------------------
// Key masking
// ---------------------------------------------------------------------------

/**
 * Mask an API key for display: show first 3 and last 6 chars.
 * Returns `null` for falsy input.
 */
export function maskApiKey(key: string | undefined | null): string | null {
  if (!key) return null;
  if (key.length <= 12) return "****";
  return key.slice(0, 3) + "..." + key.slice(-6);
}

// ---------------------------------------------------------------------------
// Effective provider resolution
// ---------------------------------------------------------------------------

/**
 * Detect the active provider from env vars alone (same logic as the original
 * `getProviderInfo()` in llm.ts).
 *
 * Exported so that `embeddings.ts` and `llm.ts` can reuse it rather than
 * duplicating the env-var sniffing logic.
 */
export function detectEnvProvider(): {
  provider: string | null;
  apiKey: string | null;
} {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { provider: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  }
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    return { provider: "ollama", apiKey: null };
  }
  return { provider: null, apiKey: null };
}

/**
 * Merge config file + env vars to produce the effective provider.
 * Priority: env vars > config file > defaults.
 */
export function getEffectiveProvider(): ProviderInfo {
  const cfg = loadConfigSync();
  const env = detectEnvProvider();

  // Resolve provider: env wins, then config
  const provider = env.provider ?? cfg.provider ?? null;
  if (!provider) {
    return {
      configured: false,
      provider: null,
      model: null,
      embeddingSupport: false,
    };
  }

  // Resolve model
  const modelOverride = process.env.LLM_MODEL;
  let model: string;
  if (modelOverride) {
    model = modelOverride;
  } else if (cfg.model) {
    model = cfg.model;
  } else if (provider === "ollama" && process.env.OLLAMA_MODEL) {
    model = process.env.OLLAMA_MODEL;
  } else {
    model = DEFAULT_MODELS[provider] ?? provider;
  }

  return {
    configured: true,
    provider,
    model,
    embeddingSupport: hasEmbeddingSupport(),
  };
}

/**
 * Full effective settings with source annotations for the settings UI.
 */
export function getEffectiveSettings(): EffectiveSettings {
  const cfg = loadConfigSync();
  const env = detectEnvProvider();

  // Provider
  let provider: string | null;
  let providerSource: SettingSource;
  if (env.provider) {
    provider = env.provider;
    providerSource = "env";
  } else if (cfg.provider) {
    provider = cfg.provider;
    providerSource = "config";
  } else {
    provider = null;
    providerSource = "none";
  }

  // API key
  let apiKey: string | null;
  let apiKeySource: SettingSource;
  if (env.apiKey) {
    apiKey = env.apiKey;
    apiKeySource = "env";
  } else if (cfg.apiKey) {
    apiKey = cfg.apiKey;
    apiKeySource = "config";
  } else {
    apiKey = null;
    apiKeySource = "none";
  }

  // Model
  let model: string | null;
  let modelSource: SettingSource;
  const modelOverride = process.env.LLM_MODEL;
  if (modelOverride) {
    model = modelOverride;
    modelSource = "env";
  } else if (cfg.model) {
    model = cfg.model;
    modelSource = "config";
  } else if (provider) {
    if (provider === "ollama" && process.env.OLLAMA_MODEL) {
      model = process.env.OLLAMA_MODEL;
      modelSource = "env";
    } else {
      model = DEFAULT_MODELS[provider] ?? null;
      modelSource = "default";
    }
  } else {
    model = null;
    modelSource = "none";
  }

  // Ollama base URL
  let ollamaBaseUrl: string | null;
  let ollamaBaseUrlSource: SettingSource;
  if (process.env.OLLAMA_BASE_URL) {
    ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
    ollamaBaseUrlSource = "env";
  } else if (cfg.ollamaBaseUrl) {
    ollamaBaseUrl = cfg.ollamaBaseUrl;
    ollamaBaseUrlSource = "config";
  } else {
    ollamaBaseUrl = null;
    ollamaBaseUrlSource = "none";
  }

  // Embedding model
  let embeddingModel: string | null;
  let embeddingModelSource: SettingSource;
  if (cfg.embeddingModel) {
    embeddingModel = cfg.embeddingModel;
    embeddingModelSource = "config";
  } else {
    embeddingModel = null;
    embeddingModelSource = "none";
  }

  return {
    provider,
    providerSource,
    model,
    modelSource,
    configured: provider !== null,
    embeddingSupport: hasEmbeddingSupport(),
    embeddingModel,
    embeddingModelSource,
    maskedApiKey: maskApiKey(apiKey),
    apiKeySource,
    ollamaBaseUrl,
    ollamaBaseUrlSource,
  };
}

// ---------------------------------------------------------------------------
// Resolved credentials for model construction (used by llm.ts)
// ---------------------------------------------------------------------------

export interface ResolvedCredentials {
  provider: string | null;
  apiKey: string | null;
  model: string | null;
  ollamaBaseUrl: string | null;
}

/**
 * Return the fully-resolved credentials for constructing an LLM model.
 * This merges env > config > defaults, intended for use from `getModel()`.
 */
export function getResolvedCredentials(): ResolvedCredentials {
  const cfg = loadConfigSync();
  const env = detectEnvProvider();

  const provider = env.provider ?? cfg.provider ?? null;
  if (!provider) {
    return { provider: null, apiKey: null, model: null, ollamaBaseUrl: null };
  }

  // API key: env wins
  let apiKey: string | null;
  if (provider === "anthropic") {
    apiKey = process.env.ANTHROPIC_API_KEY ?? cfg.apiKey ?? null;
  } else if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY ?? cfg.apiKey ?? null;
  } else if (provider === "google") {
    apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? cfg.apiKey ?? null;
  } else {
    apiKey = null; // ollama is keyless
  }

  // Model
  const modelOverride = process.env.LLM_MODEL;
  let model: string;
  if (modelOverride) {
    model = modelOverride;
  } else if (cfg.model) {
    model = cfg.model;
  } else if (provider === "ollama" && process.env.OLLAMA_MODEL) {
    model = process.env.OLLAMA_MODEL;
  } else {
    model = DEFAULT_MODELS[provider] ?? provider;
  }

  // Ollama base URL
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? cfg.ollamaBaseUrl ?? null;

  return { provider, apiKey, model, ollamaBaseUrl };
}
