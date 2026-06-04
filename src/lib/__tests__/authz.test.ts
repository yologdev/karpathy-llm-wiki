import { describe, it, expect } from "vitest";
import {
  canReadPage,
  canReadEntry,
  canReadFrontmatter,
  canSetPrivate,
} from "../authz";
import { agentOwnerHandle } from "../agents";
import type { IndexEntry } from "../types";

const alice = { handle: "alice" };
const bob = { handle: "bob" };

describe("agentOwnerHandle", () => {
  it("recovers the owner slug from a composite agent id", () => {
    expect(agentOwnerHandle("alice--yoyo")).toBe("alice");
    expect(agentOwnerHandle("yuanhao--yoyo")).toBe("yuanhao");
  });
  it("returns null for a bare/legacy id with no delimiter", () => {
    expect(agentOwnerHandle("yoyo")).toBeNull();
    expect(agentOwnerHandle("")).toBeNull();
  });
  it("splits on the FIRST delimiter", () => {
    expect(agentOwnerHandle("a--b--c")).toBe("a");
  });
});

describe("canReadPage", () => {
  it("public pages are readable by everyone (anon, owner, other)", () => {
    const pub = { owner: "alice", visibility: undefined };
    expect(canReadPage(pub, null)).toBe(true);
    expect(canReadPage(pub, alice)).toBe(true);
    expect(canReadPage(pub, bob)).toBe(true);
  });

  it("treats any non-'private' visibility as public", () => {
    expect(canReadPage({ owner: "alice", visibility: "public" }, bob)).toBe(true);
    expect(canReadPage({ owner: "alice", visibility: "weird" }, bob)).toBe(true);
  });

  it("private pages are readable only by the owner", () => {
    const priv = { owner: "alice", visibility: "private" };
    expect(canReadPage(priv, alice)).toBe(true);
    expect(canReadPage(priv, bob)).toBe(false);
    expect(canReadPage(priv, null)).toBe(false);
  });

  it("private agent-owned pages are readable by the human owner of the agent", () => {
    const priv = { owner: "alice--yoyo", visibility: "private", type: "agent-knowledge" };
    expect(canReadPage(priv, alice)).toBe(true); // human owner
    expect(canReadPage(priv, bob)).toBe(false);
    expect(canReadPage(priv, null)).toBe(false);
  });

  it("fails closed on a private page with no owner", () => {
    expect(canReadPage({ visibility: "private" }, alice)).toBe(false);
    expect(canReadPage({ visibility: "private" }, null)).toBe(false);
  });
});

describe("canReadEntry / canReadFrontmatter", () => {
  it("authorizes an index entry", () => {
    const entry: IndexEntry = {
      slug: "p",
      title: "P",
      summary: "",
      owner: "alice",
      visibility: "private",
    };
    expect(canReadEntry(entry, alice)).toBe(true);
    expect(canReadEntry(entry, bob)).toBe(false);
  });

  it("authorizes a frontmatter record (coercing unknown types)", () => {
    const fm = { owner: "alice", visibility: "private", type: "wiki" };
    expect(canReadFrontmatter(fm, alice)).toBe(true);
    expect(canReadFrontmatter(fm, bob)).toBe(false);
    // Non-string fields are ignored → treated as public.
    expect(canReadFrontmatter({ owner: 123, visibility: 1 }, bob)).toBe(true);
  });
});

describe("canSetPrivate", () => {
  it("denies anonymous principals without touching Clerk", async () => {
    expect(await canSetPrivate(null)).toBe(false);
  });
  it("denies service/token principals", async () => {
    expect(await canSetPrivate({ id: "service:ci", handle: "ci" })).toBe(false);
  });
});
