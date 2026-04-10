import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  loadConfig,
  saveConfig,
  loadConfigSync,
  maskApiKey,
  isValidProvider,
  getEffectiveProvider,
  getEffectiveSettings,
  getResolvedCredentials,
  _resetConfigCache,
  type AppConfig,
} from "../config";

// ---------------------------------------------------------------------------
// Helpers — use a temp dir so tests don't touch the real project root
// ---------------------------------------------------------------------------

let tmpDir: string;

// Save/restore all env vars that config.ts and llm.ts check
let savedEnv: Record<string, string | undefined>;
const ENV_KEYS = [
  "DATA_DIR",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "LLM_MODEL",
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
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.LLM_MODEL;

  // Point config store at the temp dir
  process.env.DATA_DIR = tmpDir;

  // Always start with a fresh cache
  _resetConfigCache();
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
    const configPath = path.join(tmpDir, ".llm-wiki-config.json");
    await fs.writeFile(configPath, JSON.stringify({ provider: "openai", model: "gpt-4o" }));
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
      apiKey: "sk-ant-test-key-12345",
      model: "claude-sonnet-4-20250514",
      embeddingModel: "text-embedding-3-small",
    };
    await saveConfig(config);
    const loaded = await loadConfig();
    expect(loaded).toEqual(config);
  });

  it("overwrites existing config", async () => {
    await saveConfig({ provider: "openai", apiKey: "sk-old" });
    await saveConfig({ provider: "google", apiKey: "google-key" });
    const loaded = await loadConfig();
    expect(loaded.provider).toBe("google");
    expect(loaded.apiKey).toBe("google-key");
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

  it("reads config from file", async () => {
    await saveConfig({ provider: "openai", model: "gpt-4o" });
    _resetConfigCache();
    const cfg = loadConfigSync();
    expect(cfg.provider).toBe("openai");
  });

  it("caches results within TTL", async () => {
    await saveConfig({ provider: "openai" });
    _resetConfigCache();

    const first = loadConfigSync();
    expect(first.provider).toBe("openai");

    // Write a different value directly (bypassing cache invalidation)
    const configPath = path.join(tmpDir, ".llm-wiki-config.json");
    await fs.writeFile(configPath, JSON.stringify({ provider: "google" }));

    // Cache should still return old value
    const second = loadConfigSync();
    expect(second.provider).toBe("openai");

    // After reset, should read new value
    _resetConfigCache();
    const third = loadConfigSync();
    expect(third.provider).toBe("google");
  });
});

// ---------------------------------------------------------------------------
// maskApiKey
// ---------------------------------------------------------------------------

describe("maskApiKey", () => {
  it("returns null for undefined", () => {
    expect(maskApiKey(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(maskApiKey("")).toBeNull();
  });

  it("returns **** for short keys", () => {
    expect(maskApiKey("short")).toBe("****");
  });

  it("masks long keys showing first 3 and last 6 chars", () => {
    const key = "sk-ant-api03-long-test-key-abc123";
    const masked = maskApiKey(key);
    expect(masked).toBe("sk-...abc123");
    // Should not contain the full key
    expect(masked).not.toBe(key);
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
    await saveConfig({ provider: "openai", apiKey: "sk-config-key", model: "gpt-4o-mini" });
    _resetConfigCache();

    const info = getEffectiveProvider();
    expect(info.configured).toBe(true);
    expect(info.provider).toBe("openai");
    expect(info.model).toBe("gpt-4o-mini");
  });

  it("env var provider wins over config file provider", async () => {
    await saveConfig({ provider: "openai", apiKey: "sk-config-key" });
    _resetConfigCache();
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    const info = getEffectiveProvider();
    expect(info.provider).toBe("anthropic");
  });

  it("LLM_MODEL env var wins over config file model", async () => {
    await saveConfig({ provider: "openai", apiKey: "sk-key", model: "gpt-4o-mini" });
    _resetConfigCache();
    process.env.LLM_MODEL = "gpt-4-turbo";

    const info = getEffectiveProvider();
    expect(info.model).toBe("gpt-4-turbo");
  });

  it("uses default model when neither env nor config specify one", async () => {
    await saveConfig({ provider: "anthropic", apiKey: "sk-key" });
    _resetConfigCache();

    const info = getEffectiveProvider();
    expect(info.model).toBe("claude-sonnet-4-20250514");
  });
});

// ---------------------------------------------------------------------------
// getEffectiveSettings — source annotations
// ---------------------------------------------------------------------------

describe("getEffectiveSettings", () => {
  it("reports source as 'config' when set via config file", async () => {
    await saveConfig({ provider: "openai", apiKey: "sk-test-key-1234567890" });
    _resetConfigCache();

    const settings = getEffectiveSettings();
    expect(settings.providerSource).toBe("config");
    expect(settings.apiKeySource).toBe("config");
    expect(settings.maskedApiKey).not.toBeNull();
    expect(settings.maskedApiKey).not.toContain("sk-test-key-1234567890");
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
    await saveConfig({ provider: "anthropic", apiKey: "sk-key" });
    _resetConfigCache();

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

  it("resolves credentials from config file", async () => {
    await saveConfig({ provider: "openai", apiKey: "sk-file-key", model: "gpt-4o-mini" });
    _resetConfigCache();

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("openai");
    expect(creds.apiKey).toBe("sk-file-key");
    expect(creds.model).toBe("gpt-4o-mini");
  });

  it("env api key wins over config file api key", async () => {
    await saveConfig({ provider: "openai", apiKey: "sk-file-key" });
    _resetConfigCache();
    process.env.OPENAI_API_KEY = "sk-env-key";

    const creds = getResolvedCredentials();
    expect(creds.apiKey).toBe("sk-env-key");
  });

  it("resolves ollama base url from config", async () => {
    await saveConfig({ provider: "ollama", ollamaBaseUrl: "http://myhost:11434/api" });
    _resetConfigCache();

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("ollama");
    expect(creds.ollamaBaseUrl).toBe("http://myhost:11434/api");
    expect(creds.apiKey).toBeNull();
  });
});
