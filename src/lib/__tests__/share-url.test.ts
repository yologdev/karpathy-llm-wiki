import { describe, it, expect } from "vitest";
import { wikiUrlFor, str } from "../share-url";

describe("wikiUrlFor", () => {
  it("public commons page → global /wiki/<slug>", () => {
    expect(wikiUrlFor("transformers", { type: "wiki" })).toBe(
      "/wiki/transformers",
    );
    expect(wikiUrlFor("x", { owner: "yuanhao" })).toBe("/wiki/x");
  });

  it("html artifact → owner-scoped (excluded from the commons)", () => {
    expect(wikiUrlFor("about-poke", { type: "html", owner: "yuanhao" })).toBe(
      "/u/yuanhao/about-poke",
    );
  });

  it("private page → owner-scoped (never a commons URL that 404s/leaks)", () => {
    expect(
      wikiUrlFor("secret", { visibility: "private", owner: "Alice" }),
    ).toBe("/u/alice/secret");
  });

  it("agent-scoped page → owner-scoped", () => {
    expect(
      wikiUrlFor("notes", { type: "agent-knowledge", owner: "yuanhao--yoyo" }),
    ).toBe("/u/yuanhao--yoyo/notes");
  });

  it("ownerless public page still resolves to commons", () => {
    expect(wikiUrlFor("seed", {})).toBe("/wiki/seed");
  });
});

describe("str", () => {
  it("passes strings, drops non-strings", () => {
    expect(str("hi")).toBe("hi");
    expect(str(42)).toBeUndefined();
    expect(str(undefined)).toBeUndefined();
    expect(str(["a"])).toBeUndefined();
  });
});
