import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents", () => ({
  setPageShared: vi.fn(),
  agentIdFor: (owner: string, name = "yoyo") => `${owner}--${name}`,
  DEFAULT_AGENT_NAME: "yoyo",
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "alice", handle: "alice" })),
}));

vi.mock("@/lib/wiki", () => ({
  readWikiPageWithFrontmatter: vi.fn(),
}));

import { setPageShared } from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { POST, DELETE } from "@/app/api/agents/share/route";

const mockedShare = vi.mocked(setPageShared);
const mockedGetPrincipal = vi.mocked(getPrincipal);
const mockedReadPage = vi.mocked(readWikiPageWithFrontmatter);

function req(body: unknown): Request {
  return new Request("http://localhost/api/agents/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A page owned by `owner` (with optional contributors). */
function pageOwnedBy(owner: string, contributors: string[] = []) {
  return {
    slug: "alice-note",
    frontmatter: { owner, contributors },
    body: "# alice-note\n\nx",
  } as unknown as Awaited<ReturnType<typeof readWikiPageWithFrontmatter>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
  mockedReadPage.mockResolvedValue(pageOwnedBy("alice"));
  mockedShare.mockResolvedValue();
});

describe("POST/DELETE /api/agents/share", () => {
  it("shares your own page into your yoyo (owner-derived agent id)", async () => {
    const res = await POST(req({ slug: "alice-note" }));
    expect(res.status).toBe(200);
    expect(mockedShare).toHaveBeenCalledWith("alice-note", "alice--yoyo", true);
  });

  it("DELETE unshares", async () => {
    const res = await DELETE(req({ slug: "alice-note" }));
    expect(res.status).toBe(200);
    expect(mockedShare).toHaveBeenCalledWith("alice-note", "alice--yoyo", false);
  });

  it("allows a contributor to share", async () => {
    mockedReadPage.mockResolvedValue(pageOwnedBy("bob", ["alice"]));
    const res = await POST(req({ slug: "alice-note" }));
    expect(res.status).toBe(200);
    expect(mockedShare).toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await POST(req({ slug: "alice-note" }));
    expect(res.status).toBe(401);
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it("returns 403 when you don't own the page", async () => {
    mockedReadPage.mockResolvedValue(pageOwnedBy("bob"));
    const res = await POST(req({ slug: "alice-note" }));
    expect(res.status).toBe(403);
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it("returns 404 when the page doesn't exist", async () => {
    mockedReadPage.mockResolvedValue(null);
    const res = await POST(req({ slug: "ghost" }));
    expect(res.status).toBe(404);
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it("returns 400 when slug is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockedShare).not.toHaveBeenCalled();
  });
});
