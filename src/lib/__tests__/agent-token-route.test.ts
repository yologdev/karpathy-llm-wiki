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
  assertCanMutateAgent,
  AgentOwnershipError,
} from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { POST, DELETE } from "@/app/api/agents/[id]/token/route";
import type { AgentProfile } from "@/lib/types";

const mockedGen = vi.mocked(generateAgentToken);
const mockedRevoke = vi.mocked(revokeAgentToken);
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
