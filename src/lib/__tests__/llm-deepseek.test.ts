import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock every provider SDK + the `ai` module so getModel()/callLLM construct
// models without any network calls. We assert HOW the deepseek model is built:
// via createOpenAI pointed at the DeepSeek base URL.
// `vi.hoisted` so the mock fn exists before the hoisted vi.mock factory runs.
const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(() => vi.fn((id: string) => ({ id }))),
}));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: createOpenAIMock }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: vi.fn(() => vi.fn()) }));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn()),
}));
vi.mock("ollama-ai-provider-v2", () => ({ createOllama: vi.fn(() => vi.fn()) }));
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "ok" })),
  streamText: vi.fn(() => ({ toTextStreamResponse: vi.fn() })),
}));

import { callLLM } from "../llm";
import { _resetConfigCache } from "../config";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "LLM_MODEL",
  "DATA_DIR",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // No config file at this path.
  process.env.DATA_DIR = "/tmp/llm-wiki-ds-test-nonexistent";
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, but re-assert the factory impl to be safe.
  createOpenAIMock.mockImplementation(() => vi.fn((id: string) => ({ id })));
  _resetConfigCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetConfigCache();
});

describe("DeepSeek getModel construction", () => {
  it("builds deepseek via createOpenAI with the DeepSeek base URL", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds";
    _resetConfigCache();

    await callLLM("system", "message");

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: "sk-ds",
      baseURL: "https://api.deepseek.com",
    });
    // Default model is deepseek-v4-flash.
    const modelFactory = createOpenAIMock.mock.results[0].value;
    expect(modelFactory).toHaveBeenCalledWith("deepseek-v4-flash");
  });

  it("honors LLM_MODEL=deepseek-v4-pro", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds";
    process.env.LLM_MODEL = "deepseek-v4-pro";
    _resetConfigCache();

    await callLLM("system", "message");

    const modelFactory = createOpenAIMock.mock.results[0].value;
    expect(modelFactory).toHaveBeenCalledWith("deepseek-v4-pro");
  });
});
