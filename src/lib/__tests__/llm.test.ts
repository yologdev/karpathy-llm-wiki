import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasLLMKey, callLLM } from "../llm";

// Save and restore env vars around each test so we don't leak state.
let savedAnthropic: string | undefined;
let savedOpenAI: string | undefined;
let savedModel: string | undefined;

beforeEach(() => {
  savedAnthropic = process.env.ANTHROPIC_API_KEY;
  savedOpenAI = process.env.OPENAI_API_KEY;
  savedModel = process.env.LLM_MODEL;
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
  restore("LLM_MODEL", savedModel);
});

describe("hasLLMKey", () => {
  it("returns false when no API keys are set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(hasLLMKey()).toBe(false);
  });

  it("returns true when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.OPENAI_API_KEY;
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when OPENAI_API_KEY is set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    expect(hasLLMKey()).toBe(true);
  });

  it("returns true when both keys are set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(hasLLMKey()).toBe(true);
  });
});

describe("callLLM", () => {
  it("throws a clear error when no API key is set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(callLLM("system", "hello")).rejects.toThrow(
      /No LLM API key found/,
    );
  });
});
