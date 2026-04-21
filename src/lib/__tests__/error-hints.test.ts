import { describe, it, expect } from "vitest";
import { getErrorHint } from "../error-hints";

describe("getErrorHint", () => {
  it('returns auth hint for "Invalid API key"', () => {
    const hint = getErrorHint("Invalid API key");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("auth");
    expect(hint!.suggestion).toMatch(/API key/i);
    expect(hint!.action).toEqual({
      label: "Go to Settings",
      href: "/settings",
    });
  });

  it('returns auth hint for "401 Unauthorized"', () => {
    const hint = getErrorHint("401 Unauthorized");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("auth");
  });

  it('returns rate-limit hint for "429 Too Many Requests"', () => {
    const hint = getErrorHint("429 Too Many Requests");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("rate-limit");
    expect(hint!.suggestion).toMatch(/rate limit/i);
  });

  it('returns rate-limit hint for "Rate limit exceeded"', () => {
    const hint = getErrorHint("Rate limit exceeded");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("rate-limit");
  });

  it('returns network hint for "fetch failed"', () => {
    const hint = getErrorHint("fetch failed");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("network");
    expect(hint!.suggestion).toMatch(/internet connection/i);
  });

  it('returns network hint for "ECONNREFUSED"', () => {
    const hint = getErrorHint("ECONNREFUSED");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("network");
  });

  it('returns Ollama-specific network hint for "Ollama fetch failed"', () => {
    const hint = getErrorHint("Ollama fetch failed");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("network");
    expect(hint!.suggestion).toMatch(/ollama serve/i);
  });

  it('returns Ollama-specific hint for "ollama ECONNREFUSED"', () => {
    const hint = getErrorHint("ollama ECONNREFUSED on localhost:11434");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("network");
    expect(hint!.suggestion).toMatch(/ollama serve/i);
  });

  it('returns config hint for "No provider configured"', () => {
    const hint = getErrorHint("No provider configured");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("config");
    expect(hint!.action).toEqual({
      label: "Go to Settings",
      href: "/settings",
    });
  });

  it('returns filesystem hint for "ENOENT: no such file"', () => {
    const hint = getErrorHint("ENOENT: no such file or directory");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("filesystem");
    expect(hint!.suggestion).toMatch(/wiki\/ directory/);
  });

  it('returns null for unrecognized errors', () => {
    const hint = getErrorHint("Some random error");
    expect(hint).toBeNull();
  });

  it("is case-insensitive", () => {
    const hint = getErrorHint("API KEY INVALID");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("auth");
  });

  it('returns rate-limit for "quota exceeded"', () => {
    const hint = getErrorHint("You have exceeded your quota");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("rate-limit");
  });

  it('returns filesystem for "permission denied"', () => {
    const hint = getErrorHint("Error: permission denied /wiki/index.md");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("filesystem");
  });

  it('returns config for "provider is required"', () => {
    const hint = getErrorHint("provider is required to make LLM calls");
    expect(hint).not.toBeNull();
    expect(hint!.category).toBe("config");
  });
});
