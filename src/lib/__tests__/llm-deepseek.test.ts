import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock every provider SDK + the `ai` module so getModel()/callLLM construct
// models without any network calls. We assert HOW the deepseek model is built:
// via createOpenAI pointed at the DeepSeek base URL.
// `vi.hoisted` so the mock fn exists before the hoisted vi.mock factory runs.
// The provider is both callable (default = Responses API) AND exposes `.chat()`
// (Chat Completions); deepseek must use `.chat()`, so we assert on it.
const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(() =>
    Object.assign((id: string) => ({ id, api: "responses" }), {
      chat: vi.fn((id: string) => ({ id, api: "chat" })),
    }),
  ),
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
  createOpenAIMock.mockImplementation(() =>
    Object.assign((id: string) => ({ id, api: "responses" }), {
      chat: vi.fn((id: string) => ({ id, api: "chat" })),
    }),
  );
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
    // Must use Chat Completions (.chat), NOT the default Responses API —
    // DeepSeek doesn't implement /responses. Default model deepseek-v4-flash.
    const provider = createOpenAIMock.mock.results[0].value;
    expect(provider.chat).toHaveBeenCalledWith("deepseek-v4-flash");
  });

  it("honors LLM_MODEL=deepseek-v4-pro", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds";
    process.env.LLM_MODEL = "deepseek-v4-pro";
    _resetConfigCache();

    await callLLM("system", "message");

    const provider = createOpenAIMock.mock.results[0].value;
    expect(provider.chat).toHaveBeenCalledWith("deepseek-v4-pro");
  });
});
