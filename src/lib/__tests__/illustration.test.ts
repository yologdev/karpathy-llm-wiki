import { describe, it, expect } from "vitest";
import { _internal } from "../illustration";
import { SLIDES_FORMAT_INSTRUCTION, HTML_FORMAT_INSTRUCTION } from "../query";

describe("buildIllustrationPrompt", () => {
  it("embeds the brand DNA and the scene/language", () => {
    const p = _internal.buildIllustrationPrompt("yoyo sorting boxes", "中文");
    expect(p).toContain("yoyo");
    expect(p).toContain("#B3A7F0"); // the brand purple
    expect(p).toContain("16:9");
    expect(p).toContain("yoyo sorting boxes");
    expect(p).toContain("中文");
  });
});

describe("cacheKeyFor", () => {
  it("is stable and sensitive to scene + language", () => {
    const a = _internal.cacheKeyFor("scene", "English");
    expect(_internal.cacheKeyFor("scene", "English")).toBe(a);
    expect(_internal.cacheKeyFor("other", "English")).not.toBe(a);
    expect(_internal.cacheKeyFor("scene", "中文")).not.toBe(a);
  });
});

describe("format instructions", () => {
  it("slides + html offer the yoyo-illustration directive", () => {
    expect(SLIDES_FORMAT_INSTRUCTION).toContain("yoyo-illustration");
    expect(HTML_FORMAT_INSTRUCTION).toContain("yoyo-illustration");
    // HTML uses the figure convention the renderer keys on.
    expect(HTML_FORMAT_INSTRUCTION).toContain('class="yoyo-illustration"');
  });
});
