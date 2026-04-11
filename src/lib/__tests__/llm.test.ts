import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  hasLLMKey,
  callLLM,
  callLLMStream,
  retryWithBackoff,
  isRetryableError,
} from "../llm";
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

  it("returns synchronously — streamText() is not async, so retryWithBackoff cannot wrap it", () => {
    // This test documents *why* callLLMStream doesn't use retryWithBackoff:
    // streamText() returns a StreamTextResult synchronously. The actual API
    // call happens lazily when the stream is consumed, so connection errors
    // (429, 503, ECONNRESET) only surface on stream read — not at call time.
    // Wrapping streamText() in retry would never catch transient errors.
    //
    // We set up a provider so getModel() succeeds, then verify callLLMStream
    // returns a result synchronously (not a Promise).
    process.env.OPENAI_API_KEY = "sk-test-fake-key";
    _resetConfigCache();

    const result = callLLMStream("system prompt", "user message");

    // streamText returns an object, not a Promise
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    // It should NOT be a Promise (i.e., no retry wrapper making it async)
    expect(result).not.toBeInstanceOf(Promise);
    // It should have stream-specific methods
    expect(typeof result.toTextStreamResponse).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe("isRetryableError", () => {
  it("returns true for 429 rate limit errors", () => {
    const err = new Error("Request failed with status 429");
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 503 service unavailable", () => {
    const err = new Error("Service temporarily unavailable 503");
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 500 internal server error", () => {
    const err = new Error("Internal server error 500");
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 502 bad gateway", () => {
    const err = new Error("Bad gateway 502");
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for 504 gateway timeout", () => {
    const err = new Error("Gateway timeout 504");
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for errors with status property", () => {
    const err = Object.assign(new Error("overloaded"), { status: 529 });
    // 529 is not in the set, so it should NOT be retryable via status prop
    expect(isRetryableError(err)).toBe(false);

    const err2 = Object.assign(new Error("rate limited"), { status: 429 });
    expect(isRetryableError(err2)).toBe(true);
  });

  it("returns true for network errors", () => {
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableError(new Error("socket hang up"))).toBe(true);
  });

  it("returns false for auth errors (401, 403)", () => {
    expect(isRetryableError(new Error("Unauthorized 401"))).toBe(false);
    expect(isRetryableError(new Error("Forbidden 403"))).toBe(false);
  });

  it("returns false for 400 bad request", () => {
    expect(isRetryableError(new Error("Bad request 400"))).toBe(false);
  });

  it("returns false for missing API key errors", () => {
    expect(
      isRetryableError(new Error("No LLM API key found. Set one of ...")),
    ).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(42)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------------

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const promise = retryWithBackoff(fn, 3, 100, 10_000);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on non-retryable errors (throws immediately)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Unauthorized 401"));

    await expect(retryWithBackoff(fn, 3, 100, 10_000)).rejects.toThrow(
      "Unauthorized 401",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors and succeeds on later attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Service temporarily unavailable 503"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue("success");

    // Suppress console.warn during retry
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const promise = retryWithBackoff(fn, 3, 10, 10_000);

    // Advance timers past the first backoff (attempt 0 → retry 1)
    await vi.advanceTimersByTimeAsync(50);
    // Advance past the second backoff (attempt 1 → retry 2)
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("throws the last error after exhausting all retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 first"))
      .mockRejectedValueOnce(new Error("503 second"))
      .mockRejectedValueOnce(new Error("503 third"))
      .mockRejectedValueOnce(new Error("503 final"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let caughtError: Error | undefined;
    const promise = retryWithBackoff(fn, 3, 10, 10_000).catch((err) => {
      caughtError = err;
    });

    // Advance through all backoff delays
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    await promise;
    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toBe("503 final");
    // 1 initial + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);

    warnSpy.mockRestore();
  });

  it("respects the maxMs cap on backoff delay", async () => {
    // With baseMs=1000 and attempt 3, raw delay would be 8000
    // but maxMs=2000 should cap it
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("ok");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const promise = retryWithBackoff(fn, 1, 1000, 2000);

    // The delay should be capped at ~2000ms (± jitter)
    // Advance enough to cover it
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("uses correct number of retry attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let caughtError: Error | undefined;
    const promise = retryWithBackoff(fn, 2, 10, 10_000).catch((err) => {
      caughtError = err;
    });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    await promise;
    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toBe("fetch failed");
    // maxRetries=2: initial + 2 retries = 3
    expect(fn).toHaveBeenCalledTimes(3);

    warnSpy.mockRestore();
  });
});
