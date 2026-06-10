import { describe, it, expect } from "vitest";
import { stripLeadingH1 } from "../markdown";

describe("stripLeadingH1", () => {
  it("strips a genuine leading H1 title (and its line break)", () => {
    // One trailing newline is consumed; a following blank line is harmless
    // (the markdown renderer ignores leading whitespace).
    expect(stripLeadingH1("# Title\n\nbody")).toBe("\nbody");
    expect(stripLeadingH1("# Title\nbody")).toBe("body");
    expect(stripLeadingH1("# Title")).toBe("");
  });

  it("does NOT strip an H1 that appears later in the body (the /m over-strip bug)", () => {
    expect(stripLeadingH1("intro para\n\n# Real Heading\n\nmore")).toBe(
      "intro para\n\n# Real Heading\n\nmore",
    );
    expect(stripLeadingH1("Some intro line.\n# Mid Heading\nrest")).toBe(
      "Some intro line.\n# Mid Heading\nrest",
    );
  });

  it("leaves ## / ### and #no-space alone", () => {
    expect(stripLeadingH1("## Sub\nx")).toBe("## Sub\nx");
    expect(stripLeadingH1("#NoSpace\nx")).toBe("#NoSpace\nx");
  });

  it("is a no-op when there's no leading H1", () => {
    expect(stripLeadingH1("just prose")).toBe("just prose");
    expect(stripLeadingH1("")).toBe("");
  });
});
