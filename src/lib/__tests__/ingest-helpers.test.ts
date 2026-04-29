import { describe, it, expect } from "vitest";
import { validateIngestInput } from "@/hooks/useIngest";

describe("validateIngestInput", () => {
  // ── URL mode ──────────────────────────────────────────────────────────

  it("URL mode with empty string → error", () => {
    expect(validateIngestInput("url", "", "", "")).toBe(
      "Please enter a URL",
    );
  });

  it("URL mode with whitespace-only URL → error", () => {
    expect(validateIngestInput("url", "", "", "   ")).toBe(
      "Please enter a URL",
    );
  });

  it("URL mode with invalid URL → error about valid URL", () => {
    const err = validateIngestInput("url", "", "", "not-a-url");
    expect(err).toContain("valid URL");
  });

  it("URL mode with valid URL → null (no error)", () => {
    expect(
      validateIngestInput("url", "", "", "https://example.com"),
    ).toBeNull();
  });

  it("URL mode with valid URL with whitespace padding → null", () => {
    expect(
      validateIngestInput("url", "", "", "  https://example.com  "),
    ).toBeNull();
  });

  // ── Text mode ─────────────────────────────────────────────────────────

  it("text mode with empty title → error", () => {
    expect(validateIngestInput("text", "", "some content", "")).toBe(
      "Please enter a title",
    );
  });

  it("text mode with whitespace-only title → error", () => {
    expect(validateIngestInput("text", "   ", "some content", "")).toBe(
      "Please enter a title",
    );
  });

  it("text mode with empty content → error", () => {
    expect(validateIngestInput("text", "My Title", "", "")).toBe(
      "Please enter some content",
    );
  });

  it("text mode with whitespace-only content → error", () => {
    expect(validateIngestInput("text", "My Title", "  \n  ", "")).toBe(
      "Please enter some content",
    );
  });

  it("text mode with both filled → null (no error)", () => {
    expect(
      validateIngestInput("text", "My Title", "Some content here", ""),
    ).toBeNull();
  });

  // ── batch mode (falls through to text branch) ────────────────────────

  it("batch mode without title → error (uses text branch)", () => {
    expect(validateIngestInput("batch", "", "content", "")).toBe(
      "Please enter a title",
    );
  });

  // ── title is checked before content ───────────────────────────────────

  it("text mode with both empty → title error takes precedence", () => {
    expect(validateIngestInput("text", "", "", "")).toBe(
      "Please enter a title",
    );
  });
});
