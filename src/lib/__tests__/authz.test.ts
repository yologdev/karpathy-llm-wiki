import { describe, it, expect, afterEach } from "vitest";
import {
  canReadPage,
  canReadEntry,
  canReadFrontmatter,
  canSetPrivate,
  canWritePage,
  canWriteFrontmatter,
  isAdmin,
} from "../authz";
import type { WriteKind } from "../authz";
import { agentOwnerHandle } from "../agents";
import type { IndexEntry } from "../types";

const alice = { handle: "alice" };
const bob = { handle: "bob" };

// canWritePage needs the full Principal (it inspects `id` for the service case).
const aliceP = { id: "user_alice", handle: "alice" };
const bobP = { id: "user_bob", handle: "bob" };
const service = { id: "service:yopedia", handle: "yopedia" };

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

describe("canWritePage", () => {
  it("public commons pages are collectively editable by any signed-in user", () => {
    const pub = { owner: "alice", visibility: "public" };
    expect(canWritePage(pub, aliceP)).toBe(true);
    expect(canWritePage(pub, bobP)).toBe(true); // collective
  });

  it("public pages: the per-page ACL doesn't restrict (auth is the middleware's job)", () => {
    // The write-gate middleware already rejected anon mutations; the per-page
    // ACL only guards PRIVATE pages, so a public page passes here.
    expect(canWritePage({ owner: "alice", visibility: "public" }, null)).toBe(true);
  });

  it("private pages fail closed for an anonymous principal", () => {
    expect(canWritePage({ owner: "alice", visibility: "private" }, null)).toBe(false);
  });

  it("private pages are writable only by the owner", () => {
    const priv = { owner: "alice", visibility: "private" };
    expect(canWritePage(priv, aliceP)).toBe(true);
    expect(canWritePage(priv, bobP)).toBe(false); // the security fix
  });

  it("a private agent-owned page is writable by the agent's human owner", () => {
    const priv = {
      owner: "alice--yoyo",
      visibility: "private",
      type: "agent-knowledge",
    };
    expect(canWritePage(priv, aliceP)).toBe(true); // alice owns the agent
    expect(canWritePage(priv, bobP)).toBe(false);
  });

  it("the service principal may write anything (autonomous agents / jobs)", () => {
    expect(canWritePage({ owner: "alice", visibility: "private" }, service)).toBe(true);
    expect(canWritePage({ owner: "bob", visibility: "private" }, service)).toBe(true);
  });

  it("fails closed on a private page with no owner", () => {
    expect(canWritePage({ visibility: "private" }, aliceP)).toBe(false);
  });
});

describe("admin role (ADMIN_HANDLES)", () => {
  const saved = process.env.ADMIN_HANDLES;
  afterEach(() => {
    if (saved === undefined) delete process.env.ADMIN_HANDLES;
    else process.env.ADMIN_HANDLES = saved;
  });

  it("isAdmin matches ADMIN_HANDLES case-insensitively; unset/empty/anon → false", () => {
    delete process.env.ADMIN_HANDLES;
    expect(isAdmin(aliceP)).toBe(false); // no admins configured

    process.env.ADMIN_HANDLES = "yuanhao, Alice";
    expect(isAdmin({ handle: "alice" })).toBe(true); // case-insensitive
    expect(isAdmin({ handle: "yuanhao" })).toBe(true);
    expect(isAdmin(bob)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({ handle: "" })).toBe(false);
    process.env.ADMIN_HANDLES = "   ";
    expect(isAdmin({ handle: "alice" })).toBe(false); // whitespace-only → no admins
  });

  it("isAdmin matches a Clerk user id exactly (spoof-proof) regardless of handle", () => {
    process.env.ADMIN_HANDLES = "user_2abc";
    expect(isAdmin({ id: "user_2abc", handle: "anything" })).toBe(true);
    // A different user who set their handle to the id string is NOT admin
    // (id is matched exactly against principal.id, not the handle).
    expect(isAdmin({ id: "user_evil", handle: "user_2abc" })).toBe(false);
  });

  it("an admin reads and writes any page, including others' private pages", () => {
    process.env.ADMIN_HANDLES = "alice";
    const bobsPrivate = { owner: "bob", visibility: "private" };
    expect(canReadPage(bobsPrivate, aliceP)).toBe(true);
    expect(canWritePage(bobsPrivate, aliceP)).toBe(true);
    // A non-admin, non-owner is still denied.
    const carol = { id: "user_carol", handle: "carol" };
    expect(canReadPage(bobsPrivate, carol)).toBe(false);
    expect(canWritePage(bobsPrivate, carol)).toBe(false);
  });

  it("grants nothing extra when ADMIN_HANDLES is unset", () => {
    delete process.env.ADMIN_HANDLES;
    expect(canWritePage({ owner: "bob", visibility: "private" }, aliceP)).toBe(false);
    expect(canReadPage({ owner: "bob", visibility: "private" }, aliceP)).toBe(false);
  });
});

describe("canWriteFrontmatter", () => {
  it("coerces frontmatter fields and applies the same rule", () => {
    expect(
      canWriteFrontmatter({ owner: "alice", visibility: "private" }, aliceP),
    ).toBe(true);
    expect(
      canWriteFrontmatter({ owner: "alice", visibility: "private" }, bobP),
    ).toBe(false);
    // Non-string fields → treated as public → collectively editable.
    expect(canWriteFrontmatter({ owner: 123, visibility: 1 }, bobP)).toBe(true);
  });
});

describe("realm-aware write gate (WriteKind)", () => {
  const savedAdmin = process.env.ADMIN_HANDLES;
  afterEach(() => {
    if (savedAdmin === undefined) delete process.env.ADMIN_HANDLES;
    else process.env.ADMIN_HANDLES = savedAdmin;
  });

  // A standard public commons page (no type, no private → belongsInCommons = true).
  const commonsPage = { owner: "alice", visibility: "public" };
  // A public agent-scoped page (type = "agent-knowledge" → NOT commons).
  const agentPage = { owner: "alice--yoyo", visibility: "public", type: "agent-knowledge" };
  // A private page owned by alice.
  const privatePage = { owner: "alice", visibility: "private" };

  it("blocks body writes by a human principal on a commons page", () => {
    expect(canWritePage(commonsPage, aliceP, "body")).toBe(false);
    expect(canWritePage(commonsPage, bobP, "body")).toBe(false);
  });

  it("blocks delete writes by a human principal on a commons page", () => {
    expect(canWritePage(commonsPage, aliceP, "delete")).toBe(false);
    expect(canWritePage(commonsPage, bobP, "delete")).toBe(false);
  });

  it("allows body writes by a service principal on a commons page", () => {
    expect(canWritePage(commonsPage, service, "body")).toBe(true);
  });

  it("allows delete writes by a service principal on a commons page", () => {
    expect(canWritePage(commonsPage, service, "delete")).toBe(true);
  });

  it("allows body writes by an admin on a commons page", () => {
    process.env.ADMIN_HANDLES = "alice";
    expect(canWritePage(commonsPage, aliceP, "body")).toBe(true);
  });

  it("allows delete writes by an admin on a commons page", () => {
    process.env.ADMIN_HANDLES = "alice";
    expect(canWritePage(commonsPage, aliceP, "delete")).toBe(true);
  });

  it("allows metadata writes (default writeKind) by a human on a commons page — backward compat", () => {
    // Explicit "metadata"
    expect(canWritePage(commonsPage, bobP, "metadata")).toBe(true);
    // No writeKind (default) — identical behavior to before the realm gate
    expect(canWritePage(commonsPage, bobP)).toBe(true);
  });

  it("allows body writes by a human on a private page they own (private is owner-gated, not commons-gated)", () => {
    expect(canWritePage(privatePage, aliceP, "body")).toBe(true);
    // But not by a non-owner
    expect(canWritePage(privatePage, bobP, "body")).toBe(false);
  });

  it("does not block body writes on agent-scoped public pages (not commons)", () => {
    expect(canWritePage(agentPage, aliceP, "body")).toBe(true);
  });

  it("canWriteFrontmatter passes writeKind through to canWritePage", () => {
    // body write on commons → blocked
    expect(
      canWriteFrontmatter({ owner: "alice", visibility: "public" }, bobP, "body"),
    ).toBe(false);
    // metadata write on commons → allowed
    expect(
      canWriteFrontmatter({ owner: "alice", visibility: "public" }, bobP, "metadata"),
    ).toBe(true);
    // default (no writeKind) → metadata → allowed
    expect(
      canWriteFrontmatter({ owner: "alice", visibility: "public" }, bobP),
    ).toBe(true);
  });

  it("blocks body/delete on an untyped public page (untyped public = commons)", () => {
    const untypedPublic = { owner: "bob" }; // no visibility, no type
    expect(canWritePage(untypedPublic, aliceP, "body")).toBe(false);
    expect(canWritePage(untypedPublic, aliceP, "delete")).toBe(false);
    expect(canWritePage(untypedPublic, aliceP, "metadata")).toBe(true);
  });
});
