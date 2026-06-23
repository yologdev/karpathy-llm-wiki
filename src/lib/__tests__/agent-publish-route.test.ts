import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents", () => ({
  verifyAgentToken: vi.fn(),
  getAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getServicePrincipal: vi.fn(() => null),
}));

vi.mock("@/lib/publish", () => {
  class PublishError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PublishError";
    }
  }
  return {
    publishToCommons: vi.fn(),
    PublishError,
  };
});

import { verifyAgentToken, getAgent } from "@/lib/agents";
import { getServicePrincipal } from "@/lib/auth";
import { publishToCommons, PublishError } from "@/lib/publish";
import { POST } from "@/app/api/agents/[id]/publish/route";

const mockedVerify = vi.mocked(verifyAgentToken);
const mockedGetAgent = vi.mocked(getAgent);
const mockedServicePrincipal = vi.mocked(getServicePrincipal);
const mockedPublish = vi.mocked(publishToCommons);

const params = Promise.resolve({ id: "alice--yoyo" });

function req(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/agents/alice--yoyo/publish", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedVerify.mockResolvedValue("alice--yoyo");
  mockedServicePrincipal.mockReturnValue(null);
  mockedPublish.mockResolvedValue({
    slug: "my-topic",
    previousType: "agent-knowledge",
    owner: "alice",
    agent: "alice--yoyo",
  });
});

describe("POST /api/agents/[id]/publish", () => {
  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  it("publishes with a per-agent token → 200", async () => {
    const res = await POST(req({ slug: "my-topic" }, "agent-tok"), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      published: true,
      slug: "my-topic",
      owner: "alice",
      agent: "alice--yoyo",
      previousType: "agent-knowledge",
    });
    expect(mockedPublish).toHaveBeenCalledWith("my-topic", "alice--yoyo");
  });

  it("publishes with a system token → 200", async () => {
    mockedVerify.mockResolvedValue(null);
    mockedServicePrincipal.mockReturnValue({
      id: "service:yopedia",
      handle: "yopedia",
    });
    mockedGetAgent.mockResolvedValue({
      id: "alice--yoyo",
      owner: "alice",
    } as never);

    const res = await POST(req({ slug: "my-topic" }, "sys-token"), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.published).toBe(true);
    expect(mockedPublish).toHaveBeenCalledWith("my-topic", "alice--yoyo");
  });

  // -------------------------------------------------------------------------
  // Auth errors
  // -------------------------------------------------------------------------

  it("returns 401 when no Authorization header", async () => {
    const res = await POST(req({ slug: "my-topic" }), { params });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/token required/i);
  });

  it("returns 401 when token is invalid (neither agent nor system)", async () => {
    mockedVerify.mockResolvedValue(null);
    mockedServicePrincipal.mockReturnValue(null);

    const res = await POST(req({ slug: "my-topic" }, "bad-token"), { params });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid token/i);
  });

  it("returns 403 when per-agent token belongs to a different agent", async () => {
    mockedVerify.mockResolvedValue("bob--yoyo"); // Token is for bob, route is for alice

    const res = await POST(req({ slug: "my-topic" }, "bob-tok"), { params });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/does not authenticate/i);
  });

  // -------------------------------------------------------------------------
  // Validation errors
  // -------------------------------------------------------------------------

  it("returns 400 when slug is missing in body", async () => {
    const res = await POST(req({}, "agent-tok"), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/slug/i);
  });

  it("returns 400 when slug is empty string", async () => {
    const res = await POST(req({ slug: "   " }, "agent-tok"), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/slug/i);
  });

  // -------------------------------------------------------------------------
  // publishToCommons errors
  // -------------------------------------------------------------------------

  it("returns 400 when publishToCommons throws PublishError", async () => {
    mockedPublish.mockRejectedValue(
      new PublishError('Page "bad-slug" is not agent-scoped'),
    );

    const res = await POST(req({ slug: "bad-slug" }, "agent-tok"), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not agent-scoped/i);
  });

  // -------------------------------------------------------------------------
  // Agent not found (system token path)
  // -------------------------------------------------------------------------

  it("returns 404 when system token targets a non-existent agent", async () => {
    mockedVerify.mockResolvedValue(null);
    mockedServicePrincipal.mockReturnValue({
      id: "service:yopedia",
      handle: "yopedia",
    });
    mockedGetAgent.mockResolvedValue(null);

    const res = await POST(req({ slug: "my-topic" }, "sys-token"), { params });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  // -------------------------------------------------------------------------
  // Unexpected errors
  // -------------------------------------------------------------------------

  it("returns 500 on unexpected error", async () => {
    mockedPublish.mockRejectedValue(new Error("storage exploded"));

    const res = await POST(req({ slug: "my-topic" }, "agent-tok"), { params });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Publish failed.");
  });
});
