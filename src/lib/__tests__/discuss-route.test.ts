import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(),
  getServicePrincipal: vi.fn(() => null),
}));
vi.mock("@/lib/authz", () => ({ canReadSlug: vi.fn() }));
vi.mock("@/lib/talk", () => ({
  getThread: vi.fn(),
  resolveThread: vi.fn(),
}));
vi.mock("@/lib/wiki", () => ({
  readWikiPageWithFrontmatter: vi.fn(),
}));

import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { canReadSlug } from "@/lib/authz";
import { getThread, resolveThread } from "@/lib/talk";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";

const mockedGetPrincipal = vi.mocked(getPrincipal);
const mockedGetService = vi.mocked(getServicePrincipal);
const mockedCanReadSlug = vi.mocked(canReadSlug);
const mockedGetThread = vi.mocked(getThread);
const mockedResolveThread = vi.mocked(resolveThread);
const mockedReadPage = vi.mocked(readWikiPageWithFrontmatter);

async function callPatch(slug: string, idx: string, body: unknown) {
  const { PATCH } = await import(
    "@/app/api/wiki/[slug]/discuss/[threadIndex]/route"
  );
  const req = new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ slug, threadIndex: idx }) });
}

// A minimal thread where alice is the author (first commenter)
const threadByAlice = {
  pageSlug: "test-page",
  title: "Discussion",
  status: "open" as const,
  created: "2025-01-01T00:00:00Z",
  updated: "2025-01-01T00:00:00Z",
  comments: [
    { id: "1", author: "alice", created: "2025-01-01T00:00:00Z", body: "Hi", parentId: null },
  ],
};

// Resolved thread returned by resolveThread
const resolvedThread = { ...threadByAlice, status: "resolved" as const };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: signed-in user "bob" (not the thread author, not the page owner)
  mockedGetPrincipal.mockResolvedValue({ id: "u-bob", handle: "bob" });
  mockedGetService.mockReturnValue(null);
  mockedCanReadSlug.mockResolvedValue(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetThread.mockResolvedValue(threadByAlice as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedResolveThread.mockResolvedValue(resolvedThread as any);
  // Page owned by "owner-user"
  mockedReadPage.mockResolvedValue({
    slug: "test-page",
    title: "Test",
    content: "",
    path: "",
    body: "",
    frontmatter: { owner: "owner-user" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("PATCH /api/wiki/[slug]/discuss/[threadIndex] — ownership check", () => {
  it("thread author can resolve their own thread", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "u-alice", handle: "alice" });
    const res = await callPatch("test-page", "0", { status: "resolved" });
    expect(res.status).toBe(200);
    expect(mockedResolveThread).toHaveBeenCalledWith("test-page", 0, "resolved");
  });

  it("page owner can resolve any thread on their page", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "u-owner", handle: "owner-user" });
    const res = await callPatch("test-page", "0", { status: "resolved" });
    expect(res.status).toBe(200);
    expect(mockedResolveThread).toHaveBeenCalledWith("test-page", 0, "resolved");
  });

  it("other authenticated users get 403", async () => {
    // bob is not the thread author (alice) nor the page owner (owner-user)
    const res = await callPatch("test-page", "0", { status: "resolved" });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("thread author or page owner");
    expect(mockedResolveThread).not.toHaveBeenCalled();
  });

  it("service principal can resolve any thread", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetService.mockReturnValue({ id: "service:yoyo", handle: "yoyo" });
    const res = await callPatch("test-page", "0", { status: "resolved" });
    expect(res.status).toBe(200);
    expect(mockedResolveThread).toHaveBeenCalledWith("test-page", 0, "resolved");
  });

  it("thread author can reopen a resolved thread", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "u-alice", handle: "alice" });
    const res = await callPatch("test-page", "0", { status: "open" });
    expect(res.status).toBe(200);
    expect(mockedResolveThread).toHaveBeenCalledWith("test-page", 0, "open");
  });

  it("thread author can wontfix their own thread", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "u-alice", handle: "alice" });
    const res = await callPatch("test-page", "0", { status: "wontfix" });
    expect(res.status).toBe(200);
    expect(mockedResolveThread).toHaveBeenCalledWith("test-page", 0, "wontfix");
  });

  it("returns 404 when canReadSlug is false (private page cloaking)", async () => {
    mockedCanReadSlug.mockResolvedValue(false);
    const res = await callPatch("secret-page", "0", { status: "resolved" });
    expect(res.status).toBe(404);
    expect(mockedResolveThread).not.toHaveBeenCalled();
  });

  it("returns 404 when thread does not exist", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "u-alice", handle: "alice" });
    mockedGetThread.mockResolvedValue(null);
    const res = await callPatch("test-page", "99", { status: "resolved" });
    expect(res.status).toBe(404);
    expect(mockedResolveThread).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid status value", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "u-alice", handle: "alice" });
    const res = await callPatch("test-page", "0", { status: "invalid" });
    expect(res.status).toBe(400);
    expect(mockedResolveThread).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid threadIndex", async () => {
    const res = await callPatch("test-page", "-1", { status: "resolved" });
    expect(res.status).toBe(400);
  });
});
