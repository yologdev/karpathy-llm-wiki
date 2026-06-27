import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents", () => {
  class AgentOwnershipError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AgentOwnershipError";
    }
  }
  return {
    generateAgentToken: vi.fn(),
    revokeAgentToken: vi.fn(),
    agentTokenInfo: vi.fn(),
    assertCanMutateAgent: vi.fn(),
    AgentOwnershipError,
  };
});

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "alice", handle: "alice" })),
}));

import {
  generateAgentToken,
  revokeAgentToken,
  agentTokenInfo,
  assertCanMutateAgent,
  AgentOwnershipError,
} from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { GET, POST, DELETE } from "@/app/api/agents/[id]/token/route";
import type { AgentProfile } from "@/lib/types";

const mockedGen = vi.mocked(generateAgentToken);
const mockedRevoke = vi.mocked(revokeAgentToken);
const mockedInfo = vi.mocked(agentTokenInfo);
const mockedAssert = vi.mocked(assertCanMutateAgent);
const mockedGetPrincipal = vi.mocked(getPrincipal);

const params = Promise.resolve({ id: "alice--yoyo" });
const ownedAgent = { id: "alice--yoyo", owner: "alice" } as AgentProfile;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
  mockedAssert.mockResolvedValue(ownedAgent);
  mockedGen.mockResolvedValue("alice--yoyo.secret123");
  mockedRevoke.mockResolvedValue();
  mockedInfo.mockResolvedValue({ exists: true, createdAt: "2026-06-27T00:00:00.000Z" });
});

describe("GET /api/agents/[id]/token", () => {
  it("returns token status to the owner (never the secret)", async () => {
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: true, createdAt: "2026-06-27T00:00:00.000Z" });
    expect(mockedInfo).toHaveBeenCalledWith("alice--yoyo");
  });

  it("401 when signed out", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
    expect(mockedInfo).not.toHaveBeenCalled();
  });

  it("403 when not the owner", async () => {
    mockedAssert.mockRejectedValue(new AgentOwnershipError("not owner"));
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(403);
    expect(mockedInfo).not.toHaveBeenCalled();
  });

  it("404 when the agent doesn't exist", async () => {
    mockedAssert.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
    expect(mockedInfo).not.toHaveBeenCalled();
  });
});

describe("POST /api/agents/[id]/token", () => {
  it("returns the freshly generated token to the owner", async () => {
    const res = await POST(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("alice--yoyo.secret123");
    expect(mockedGen).toHaveBeenCalledWith("alice--yoyo");
  });

  it("401 when signed out", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
    expect(mockedGen).not.toHaveBeenCalled();
  });

  it("403 when not the owner", async () => {
    mockedAssert.mockRejectedValue(new AgentOwnershipError("not owner"));
    const res = await POST(new Request("http://localhost"), { params });
    expect(res.status).toBe(403);
    expect(mockedGen).not.toHaveBeenCalled();
  });

  it("404 when the agent doesn't exist", async () => {
    mockedAssert.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
    expect(mockedGen).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/agents/[id]/token", () => {
  it("revokes for the owner", async () => {
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(mockedRevoke).toHaveBeenCalledWith("alice--yoyo");
  });

  it("403 when not the owner", async () => {
    mockedAssert.mockRejectedValue(new AgentOwnershipError("not owner"));
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(403);
    expect(mockedRevoke).not.toHaveBeenCalled();
  });
});
