import { describe, it, expect } from "vitest";
import {
  PROVIDER_INFO,
  VALID_PROVIDERS,
  DEFAULT_MODELS,
  providerLabel,
} from "../providers";

// ---------------------------------------------------------------------------
// PROVIDER_INFO
// ---------------------------------------------------------------------------

describe("PROVIDER_INFO", () => {
  it("has entries for anthropic, openai, google, ollama", () => {
    const values = PROVIDER_INFO.map((p) => p.value);
    expect(values).toContain("anthropic");
    expect(values).toContain("openai");
    expect(values).toContain("google");
    expect(values).toContain("ollama");
  });

  it("has exactly 4 providers", () => {
    expect(PROVIDER_INFO).toHaveLength(4);
  });

  it("each entry has value and label properties", () => {
    for (const entry of PROVIDER_INFO) {
      expect(typeof entry.value).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(entry.value.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("labels are human-readable (capitalized)", () => {
    for (const entry of PROVIDER_INFO) {
      // Label should start with an uppercase letter
      expect(entry.label[0]).toBe(entry.label[0].toUpperCase());
    }
  });
});

// ---------------------------------------------------------------------------
// VALID_PROVIDERS
// ---------------------------------------------------------------------------

describe("VALID_PROVIDERS", () => {
  it("is a Set containing exactly the 4 provider values", () => {
    expect(VALID_PROVIDERS).toBeInstanceOf(Set);
    expect(VALID_PROVIDERS.size).toBe(4);
    expect(VALID_PROVIDERS.has("anthropic")).toBe(true);
    expect(VALID_PROVIDERS.has("openai")).toBe(true);
    expect(VALID_PROVIDERS.has("google")).toBe(true);
    expect(VALID_PROVIDERS.has("ollama")).toBe(true);
  });

  it("does not contain unknown providers", () => {
    expect(VALID_PROVIDERS.has("azure")).toBe(false);
    expect(VALID_PROVIDERS.has("")).toBe(false);
    expect(VALID_PROVIDERS.has("ANTHROPIC")).toBe(false);
  });

  it("matches PROVIDER_INFO values exactly", () => {
    const infoValues = new Set(PROVIDER_INFO.map((p) => p.value));
    expect(VALID_PROVIDERS).toEqual(infoValues);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_MODELS
// ---------------------------------------------------------------------------

describe("DEFAULT_MODELS", () => {
  it("has a default model for each provider", () => {
    for (const provider of VALID_PROVIDERS) {
      expect(DEFAULT_MODELS[provider]).toBeDefined();
      expect(typeof DEFAULT_MODELS[provider]).toBe("string");
      expect(DEFAULT_MODELS[provider].length).toBeGreaterThan(0);
    }
  });

  it("has exactly 4 entries", () => {
    expect(Object.keys(DEFAULT_MODELS)).toHaveLength(4);
  });

  it("anthropic default model contains claude", () => {
    expect(DEFAULT_MODELS.anthropic.toLowerCase()).toContain("claude");
  });

  it("openai default model contains gpt", () => {
    expect(DEFAULT_MODELS.openai.toLowerCase()).toContain("gpt");
  });
});

// ---------------------------------------------------------------------------
// providerLabel
// ---------------------------------------------------------------------------

describe("providerLabel", () => {
  it("returns 'Anthropic' for 'anthropic'", () => {
    expect(providerLabel("anthropic")).toBe("Anthropic");
  });

  it("returns 'OpenAI' for 'openai'", () => {
    expect(providerLabel("openai")).toBe("OpenAI");
  });

  it("returns 'Google' for 'google'", () => {
    expect(providerLabel("google")).toBe("Google");
  });

  it("returns 'Ollama' for 'ollama'", () => {
    expect(providerLabel("ollama")).toBe("Ollama");
  });

  it("returns raw string for unknown provider", () => {
    expect(providerLabel("azure")).toBe("azure");
  });

  it("returns raw string for empty string", () => {
    expect(providerLabel("")).toBe("");
  });

  it("is case-sensitive — 'Anthropic' is unknown", () => {
    expect(providerLabel("Anthropic")).toBe("Anthropic");
  });
});
