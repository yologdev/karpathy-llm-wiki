import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  loadConfig,
  saveConfig,
  loadConfigSync,
  isValidProvider,
  isReadOnly,
  getEffectiveProvider,
  getEffectiveSettings,
  getResolvedCredentials,
  getWikiDir,
  getRawDir,
  getEmbeddingModelOverride,
  getOllamaBaseUrl,
  _resetConfigCache,
  type AppConfig,
} from "../config";
import { _resetStorage } from "../storage";

// ---------------------------------------------------------------------------
// Helpers — use a temp dir so tests don't touch the real project root
// ---------------------------------------------------------------------------

let tmpDir: string;

// Save/restore all env vars that config.ts and llm.ts check
let savedEnv: Record<string, string | undefined>;
const ENV_KEYS = [
  "DATA_DIR",
  "WIKI_DIR",
  "RAW_DIR",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "LLM_MODEL",
  "EMBEDDING_MODEL",
  "EMBEDDING_PROVIDER",
  "YOPEDIA_READONLY",
  "STORAGE_PROVIDER",
];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-cfg-"));

  // Save all env vars
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }

  // Clear provider env vars so config-file tests are isolated
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.LLM_MODEL;
  delete process.env.EMBEDDING_PROVIDER;

  // Point config store at the temp dir
  process.env.DATA_DIR = tmpDir;

  // Always start with a fresh cache and storage singleton
  _resetConfigCache();
  _resetStorage();
});

afterEach(async () => {
  // Restore env vars
  for (const key of ENV_KEYS) {
    const val = savedEnv[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  _resetConfigCache();
  _resetStorage();

  // Clean up temp dir
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe("loadConfig", () => {
  it("returns {} when config file is missing", async () => {
    const cfg = await loadConfig();
    expect(cfg).toEqual({});
  });

  it("returns parsed config from file", async () => {
    // Write config via saveConfig so storage provider is used
    await saveConfig({ provider: "openai", model: "gpt-4o" });
    _resetConfigCache();
    const cfg = await loadConfig();
    expect(cfg.provider).toBe("openai");
    expect(cfg.model).toBe("gpt-4o");
  });
});

// ---------------------------------------------------------------------------
// saveConfig + loadConfig round-trip
// ---------------------------------------------------------------------------

describe("saveConfig / loadConfig round-trip", () => {
  it("persists and reads back the full config", async () => {
    const config: AppConfig = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      embeddingModel: "text-embedding-3-small",
    };
    await saveConfig(config);
    const loaded = await loadConfig();
    expect(loaded).toEqual(config);
  });

  it("overwrites existing config", async () => {
    await saveConfig({ provider: "openai" });
    await saveConfig({ provider: "google" });
    const loaded = await loadConfig();
    expect(loaded.provider).toBe("google");
  });
});

// ---------------------------------------------------------------------------
// loadConfigSync
// ---------------------------------------------------------------------------

describe("loadConfigSync", () => {
  it("returns {} when config file is missing", () => {
    const cfg = loadConfigSync();
    expect(cfg).toEqual({});
  });

  it("reads config from cache after loadConfig primes it", async () => {
    await saveConfig({ provider: "openai", model: "gpt-4o" });
    // Prime the cache via async loadConfig
    await loadConfig();
    const cfg = loadConfigSync();
    expect(cfg.provider).toBe("openai");
  });

  it("caches results within TTL", async () => {
    await saveConfig({ provider: "openai" });
    // Prime the cache via async loadConfig
    await loadConfig();

    const first = loadConfigSync();
    expect(first.provider).toBe("openai");

    // Write a different value directly (bypassing cache invalidation)
    await saveConfig({ provider: "google" });
    // Don't call loadConfig — cache should still return old value
    // because saveConfig invalidates cache, but loadConfigSync refills
    // with {} (cold cache). Let's test the real flow instead:
    _resetConfigCache();

    // Cache is cold, so loadConfigSync returns {}
    const second = loadConfigSync();
    expect(second).toEqual({});

    // After priming with loadConfig, we get the new value
    await loadConfig();
    const third = loadConfigSync();
    expect(third.provider).toBe("google");
  });

  it("returns {} when cache is cold (no prior loadConfig)", () => {
    // This is the new behavior: cold cache returns {} instead of reading disk
    const cfg = loadConfigSync();
    expect(cfg).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// isValidProvider
// ---------------------------------------------------------------------------

describe("isValidProvider", () => {
  it("accepts valid providers", () => {
    expect(isValidProvider("anthropic")).toBe(true);
    expect(isValidProvider("openai")).toBe(true);
    expect(isValidProvider("google")).toBe(true);
    expect(isValidProvider("ollama")).toBe(true);
  });

  it("rejects invalid providers", () => {
    expect(isValidProvider("mistral")).toBe(false);
    expect(isValidProvider("")).toBe(false);
    expect(isValidProvider("ANTHROPIC")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Merge priority: env vars > config file > defaults
// ---------------------------------------------------------------------------

describe("getEffectiveProvider — merge priority", () => {
  it("returns not configured when neither env nor config set", () => {
    const info = getEffectiveProvider();
    expect(info.configured).toBe(false);
    expect(info.provider).toBeNull();
  });

  it("uses config file when env vars are absent", async () => {
    await saveConfig({ provider: "openai", model: "gpt-4o-mini" });
    // Prime the sync cache so loadConfigSync returns data
    await loadConfig();

    const info = getEffectiveProvider();
    expect(info.configured).toBe(true);
    expect(info.provider).toBe("openai");
    expect(info.model).toBe("gpt-4o-mini");
  });

  it("env var provider wins over config file provider", async () => {
    await saveConfig({ provider: "openai" });
    await loadConfig();
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    const info = getEffectiveProvider();
    expect(info.provider).toBe("anthropic");
  });

  it("LLM_MODEL env var wins over config file model", async () => {
    await saveConfig({ provider: "openai", model: "gpt-4o-mini" });
    await loadConfig();
    process.env.LLM_MODEL = "gpt-4-turbo";

    const info = getEffectiveProvider();
    expect(info.model).toBe("gpt-4-turbo");
  });

  it("uses default model when neither env nor config specify one", async () => {
    await saveConfig({ provider: "anthropic" });
    await loadConfig();

    const info = getEffectiveProvider();
    expect(info.model).toBe("claude-sonnet-4-20250514");
  });
});

// ---------------------------------------------------------------------------
// getEffectiveSettings — source annotations
// ---------------------------------------------------------------------------

describe("getEffectiveSettings", () => {
  it("reports source as 'none' when apiKey only set via config file (no longer supported)", async () => {
    await saveConfig({ provider: "openai" });
    await loadConfig();

    const settings = getEffectiveSettings();
    expect(settings.providerSource).toBe("config");
    // API keys from config file are no longer supported — source should be 'none'
    expect(settings.apiKeySource).toBe("none");
    expect(settings.hasApiKey).toBe(false);
  });

  it("reports source as 'env' when set via env var", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key-1234567890";

    const settings = getEffectiveSettings();
    expect(settings.providerSource).toBe("env");
    expect(settings.apiKeySource).toBe("env");
  });

  it("reports source as 'none' when nothing is set", () => {
    const settings = getEffectiveSettings();
    expect(settings.providerSource).toBe("none");
    expect(settings.apiKeySource).toBe("none");
    expect(settings.configured).toBe(false);
  });

  it("reports model source as 'default' when using defaults", async () => {
    await saveConfig({ provider: "anthropic" });
    await loadConfig();

    const settings = getEffectiveSettings();
    expect(settings.modelSource).toBe("default");
    expect(settings.model).toBe("claude-sonnet-4-20250514");
  });
});

// ---------------------------------------------------------------------------
// getResolvedCredentials
// ---------------------------------------------------------------------------

describe("getResolvedCredentials", () => {
  it("returns null provider when nothing configured", () => {
    const creds = getResolvedCredentials();
    expect(creds.provider).toBeNull();
    expect(creds.apiKey).toBeNull();
  });

  it("resolves credentials from config file (provider + model only, no apiKey)", async () => {
    await saveConfig({ provider: "openai", model: "gpt-4o-mini" });
    await loadConfig();

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("openai");
    // API key no longer comes from config — must be set via env
    expect(creds.apiKey).toBeNull();
    expect(creds.model).toBe("gpt-4o-mini");
  });

  it("env api key is the only source for api keys", async () => {
    await saveConfig({ provider: "openai" });
    await loadConfig();
    process.env.OPENAI_API_KEY = "sk-env-key";

    const creds = getResolvedCredentials();
    expect(creds.apiKey).toBe("sk-env-key");
  });

  it("resolves ollama base url from config", async () => {
    await saveConfig({ provider: "ollama", ollamaBaseUrl: "http://myhost:11434/api" });
    await loadConfig();

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("ollama");
    expect(creds.ollamaBaseUrl).toBe("http://myhost:11434/api");
    expect(creds.apiKey).toBeNull();
  });

  it("detects deepseek from DEEPSEEK_API_KEY with its default model", () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds-key";

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("deepseek");
    expect(creds.apiKey).toBe("sk-ds-key");
    // Falls back to DEFAULT_MODELS["deepseek"] when no override is set.
    expect(creds.model).toBe("deepseek-v4-flash");
  });

  it("honors LLM_MODEL override for deepseek (e.g. v4-pro)", () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds-key";
    process.env.LLM_MODEL = "deepseek-v4-pro";

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("deepseek");
    expect(creds.model).toBe("deepseek-v4-pro");
  });
});

// ---------------------------------------------------------------------------
// getWikiDir / getRawDir — centralised directory resolution
// ---------------------------------------------------------------------------

describe("getWikiDir", () => {
  it("returns default path when no WIKI_DIR env var set", () => {
    delete process.env.WIKI_DIR;
    const dir = getWikiDir();
    expect(dir).toBe(path.join(tmpDir, "wiki"));
  });

  it("respects WIKI_DIR env override", () => {
    process.env.WIKI_DIR = "/custom/wiki-path";
    const dir = getWikiDir();
    expect(dir).toBe("/custom/wiki-path");
  });
});

describe("getRawDir", () => {
  it("returns default path when no RAW_DIR env var set", () => {
    delete process.env.RAW_DIR;
    const dir = getRawDir();
    expect(dir).toBe(path.join(tmpDir, "raw"));
  });

  it("respects RAW_DIR env override", () => {
    process.env.RAW_DIR = "/custom/raw-path";
    const dir = getRawDir();
    expect(dir).toBe("/custom/raw-path");
  });
});

// ---------------------------------------------------------------------------
// getEmbeddingModelOverride
// ---------------------------------------------------------------------------

describe("getEmbeddingModelOverride", () => {
  it("returns undefined when EMBEDDING_MODEL is not set", () => {
    delete process.env.EMBEDDING_MODEL;
    expect(getEmbeddingModelOverride()).toBeUndefined();
  });

  it("returns the env value when EMBEDDING_MODEL is set", () => {
    process.env.EMBEDDING_MODEL = "text-embedding-ada-002";
    expect(getEmbeddingModelOverride()).toBe("text-embedding-ada-002");
  });
});

// ---------------------------------------------------------------------------
// getOllamaBaseUrl
// ---------------------------------------------------------------------------

describe("getOllamaBaseUrl", () => {
  it("returns undefined when neither env nor config set", () => {
    expect(getOllamaBaseUrl()).toBeUndefined();
  });

  it("returns env var value when OLLAMA_BASE_URL is set", () => {
    process.env.OLLAMA_BASE_URL = "http://env-host:11434";
    expect(getOllamaBaseUrl()).toBe("http://env-host:11434");
  });

  it("returns config file value when env var is not set", async () => {
    await saveConfig({ ollamaBaseUrl: "http://config-host:11434" });
    // Prime cache so loadConfigSync picks it up
    await loadConfig();
    expect(getOllamaBaseUrl()).toBe("http://config-host:11434");
  });

  it("env var wins over config file value", async () => {
    await saveConfig({ ollamaBaseUrl: "http://config-host:11434" });
    await loadConfig();
    process.env.OLLAMA_BASE_URL = "http://env-host:11434";
    expect(getOllamaBaseUrl()).toBe("http://env-host:11434");
  });
});

// ---------------------------------------------------------------------------
// isReadOnly
// ---------------------------------------------------------------------------

describe("isReadOnly", () => {
  it("returns false by default", () => {
    delete process.env.YOPEDIA_READONLY;
    delete process.env.STORAGE_PROVIDER;
    expect(isReadOnly()).toBe(false);
  });

  it("returns true when YOPEDIA_READONLY=1", () => {
    process.env.YOPEDIA_READONLY = "1";
    expect(isReadOnly()).toBe(true);
  });

  it("returns false when YOPEDIA_READONLY is set to something other than 1", () => {
    process.env.YOPEDIA_READONLY = "0";
    expect(isReadOnly()).toBe(false);
  });

  it("returns true when STORAGE_PROVIDER=cloudflare-r2", () => {
    process.env.STORAGE_PROVIDER = "cloudflare-r2";
    expect(isReadOnly()).toBe(true);
  });

  it("returns false when STORAGE_PROVIDER=fs", () => {
    process.env.STORAGE_PROVIDER = "fs";
    expect(isReadOnly()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveSettings — readOnly flag
// ---------------------------------------------------------------------------

describe("getEffectiveSettings readOnly", () => {
  it("includes readOnly: false by default", () => {
    delete process.env.YOPEDIA_READONLY;
    delete process.env.STORAGE_PROVIDER;
    const s = getEffectiveSettings();
    expect(s.readOnly).toBe(false);
  });

  it("includes readOnly: true when YOPEDIA_READONLY=1", () => {
    process.env.YOPEDIA_READONLY = "1";
    const s = getEffectiveSettings();
    expect(s.readOnly).toBe(true);
  });
});
