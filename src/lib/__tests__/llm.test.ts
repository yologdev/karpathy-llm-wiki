import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasLLMKey, callLLM, callLLMStream } from "../llm";
import { _resetConfigCache } from "../config";

// Save and restore env vars around each test so we don't leak state.
let savedAnthropic: string | undefined;
let savedOpenAI: string | undefined;
let savedGoogle: string | undefined;
let savedOllamaBaseURL: string | undefined;
let savedOllamaModel: string | undefined;
let savedModel: string | undefined;
let savedDataDir: string | undefined;

beforeEach(() => {
  savedAnthropic = process.env.ANTHROPIC_API_KEY;
  savedOpenAI = process.env.OPENAI_API_KEY;
  savedGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  savedOllamaBaseURL = process.env.OLLAMA_BASE_URL;
  savedOllamaModel = process.env.OLLAMA_MODEL;
  savedModel = process.env.LLM_MODEL;
  savedDataDir = process.env.DATA_DIR;

  // Start each test from a clean slate so tests don't depend on ordering.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.LLM_MODEL;

  // Point DATA_DIR at a nonexistent path so no config file is found
  process.env.DATA_DIR = "/tmp/llm-wiki-test-nonexistent-" + Date.now();

  // Reset config cache so tests don't see stale data
  _resetConfigCache();
});

afterEach(() => {
  // Restore original values (or delete if they were unset)
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };
  restore("ANTHROPIC_API_KEY", savedAnthropic);
  restore("OPENAI_API_KEY", savedOpenAI);
  restore("GOOGLE_GENERATIVE_AI_API_KEY", savedGoogle);
  restore("OLLAMA_BASE_URL", savedOllamaBaseURL);
  restore("OLLAMA_MODEL", savedOllamaModel);
  restore("LLM_MODEL", savedModel);
  restore("DATA_DIR", savedDataDir);

  _resetConfigCache();
});

describe("hasLLMKey", () => {
  it("returns false when no provider env var is set", () => {
    expect(hasLLMKey()).toBe(false);
  });

  it("returns true when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when only GOOGLE_GENERATIVE_AI_API_KEY is set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test-key";
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when only OLLAMA_BASE_URL is set", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/api";
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when only OLLAMA_MODEL is set", () => {
    process.env.OLLAMA_MODEL = "llama3.2";
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when multiple keys are set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(hasLLMKey()).toBe(true);
  });
});

describe("callLLM", () => {
  it("throws a clear error mentioning all four providers when no env vars are set", async () => {
    const promise = callLLM("system", "hello");

    // The error should mention every supported provider env var so users
    // know their options. Using substring checks keeps the assertion
    // resilient to minor wording tweaks.
    await expect(promise).rejects.toThrow(/No LLM API key found/);
    await expect(promise).rejects.toThrow(/ANTHROPIC_API_KEY/);
    await expect(promise).rejects.toThrow(/OPENAI_API_KEY/);
    await expect(promise).rejects.toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    await expect(promise).rejects.toThrow(/OLLAMA/);
  });
});

describe("callLLMStream", () => {
  it("throws a clear error mentioning all four providers when no env vars are set", () => {
    // callLLMStream is synchronous (returns a StreamTextResult) but
    // getModel() throws immediately when no provider is configured.
    expect(() => callLLMStream("system", "hello")).toThrow(
      /No LLM API key found/,
    );
    expect(() => callLLMStream("system", "hello")).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => callLLMStream("system", "hello")).toThrow(/OPENAI_API_KEY/);
    expect(() => callLLMStream("system", "hello")).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
    expect(() => callLLMStream("system", "hello")).toThrow(/OLLAMA/);
  });
});
