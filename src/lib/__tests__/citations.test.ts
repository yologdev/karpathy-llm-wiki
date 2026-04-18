import { describe, it, expect } from "vitest";
import { extractCitedSlugs } from "../citations";

describe("extractCitedSlugs", () => {
  it("extracts slugs from ](slug.md) patterns in answer text", () => {
    const answer = "As noted in [Attention](attention.md), this is key.";
    const result = extractCitedSlugs(answer, ["attention"]);
    expect(result).toEqual(["attention"]);
  });

  it("only returns slugs that exist in availableSlugs", () => {
    const answer =
      "See [A](alpha.md) and [B](beta.md) and [C](gamma.md).";
    const result = extractCitedSlugs(answer, ["alpha", "gamma"]);
    expect(result).toContain("alpha");
    expect(result).toContain("gamma");
    expect(result).not.toContain("beta");
    expect(result).toHaveLength(2);
  });

  it("deduplicates repeated citations", () => {
    const answer =
      "First [A](attention.md) then again [A](attention.md).";
    const result = extractCitedSlugs(answer, ["attention"]);
    expect(result).toEqual(["attention"]);
  });

  it("returns empty array when no citations found", () => {
    const answer = "No links here at all.";
    expect(extractCitedSlugs(answer, ["some-page"])).toEqual([]);
  });

  it("returns empty array when availableSlugs is empty", () => {
    const answer = "See [Topic](topic.md) for info.";
    expect(extractCitedSlugs(answer, [])).toEqual([]);
  });

  it("handles slugs with hyphens and underscores", () => {
    const answer =
      "Read [Deep Learning](deep-learning.md) and [My Notes](my_notes.md).";
    const result = extractCitedSlugs(answer, [
      "deep-learning",
      "my_notes",
    ]);
    expect(result).toContain("deep-learning");
    expect(result).toContain("my_notes");
    expect(result).toHaveLength(2);
  });

  it("does not match partial slug matches", () => {
    const answer = "See [Foobar](foobar.md) for details.";
    // "foo" is in availableSlugs but "foobar" is in the text — "foo" should NOT match
    const result = extractCitedSlugs(answer, ["foo"]);
    expect(result).toEqual([]);
  });
});
