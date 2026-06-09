import { describe, it, expect } from "vitest";
import { coverGradient, monogram } from "../cover";

describe("coverGradient", () => {
  it("is deterministic — same seed yields the same gradient", () => {
    expect(coverGradient("transformers")).toBe(coverGradient("transformers"));
  });

  it("differs across seeds (variety per card)", () => {
    expect(coverGradient("transformers")).not.toBe(coverGradient("rag-vs-yopedia"));
  });

  it("produces a valid two-stop linear-gradient", () => {
    const g = coverGradient("anything");
    expect(g).toMatch(/^linear-gradient\(135deg, hsl\(\d+ .+\), hsl\(\d+ .+\)\)$/);
  });
});

describe("monogram", () => {
  it("takes the first letter of the first two words", () => {
    expect(monogram("Harness Engineering")).toBe("HE");
    expect(monogram("retrieval augmented generation")).toBe("RA");
  });

  it("uses one letter for a single word", () => {
    expect(monogram("RAG")).toBe("R");
  });

  it("falls back to · for an empty/whitespace title", () => {
    expect(monogram("")).toBe("·");
    expect(monogram("   ")).toBe("·");
  });
});
