import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the agents library. AgentOwnershipError is a real class so the route's
// `instanceof` check maps it to 403.
// ---------------------------------------------------------------------------
vi.mock("@/lib/agents", () => {
  class AgentOwnershipError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AgentOwnershipError";
    }
  }
  return {
    getAgent: vi.fn(),
    deleteAgent: vi.fn(),
    updateAgent: vi.fn(),
    assertCanMutateAgent: vi.fn(),
    AgentOwnershipError,
  };
});

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "alice", handle: "alice" })),
}));

import {
  deleteAgent,
  updateAgent,
  assertCanMutateAgent,
  AgentOwnershipError,
} from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { PUT, DELETE } from "@/app/api/agents/[id]/route";
import type { AgentProfile } from "@/lib/types";

const mockedDelete = vi.mocked(deleteAgent);
const mockedUpdate = vi.mocked(updateAgent);
const mockedAssert = vi.mocked(assertCanMutateAgent);
const mockedGetPrincipal = vi.mocked(getPrincipal);

const ownedAgent: AgentProfile = {
  id: "yoyo",
  name: "Yoyo",
  description: "An agent",
  owner: "alice",
  identityPages: [],
  learningPages: [],
  socialPages: [],
  registered: "2026-05-03T00:00:00.000Z",
  lastUpdated: "2026-05-03T00:00:00.000Z",
};

const params = Promise.resolve({ id: "yoyo" });

function putReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents/yoyo", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
  mockedAssert.mockResolvedValue(ownedAgent);
  mockedUpdate.mockResolvedValue({ ...ownedAgent, name: "Yoyo v2" });
  mockedDelete.mockResolvedValue(true);
});

describe("PUT /api/agents/[id] — ownership", () => {
  it("updates when the caller owns the agent", async () => {
    const res = await PUT(putReq({ name: "Yoyo v2" }), { params });
    expect(res.status).toBe(200);
    expect(mockedUpdate).toHaveBeenCalledWith("yoyo", { name: "Yoyo v2" });
  });

  it("returns 401 when signed out", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await PUT(putReq({ name: "x" }), { params });
    expect(res.status).toBe(401);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    mockedAssert.mockRejectedValue(
      new AgentOwnershipError('Agent "yoyo" is owned by @bob; @alice cannot modify it.'),
    );
    const res = await PUT(putReq({ name: "x" }), { params });
    expect(res.status).toBe(403);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the agent does not exist", async () => {
    mockedAssert.mockResolvedValue(null);
    const res = await PUT(putReq({ name: "x" }), { params });
    expect(res.status).toBe(404);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/agents/[id] — ownership", () => {
  it("deletes when the caller owns the agent", async () => {
    const res = await DELETE(new Request("http://localhost/api/agents/yoyo"), {
      params,
    });
    expect(res.status).toBe(200);
    expect(mockedDelete).toHaveBeenCalledWith("yoyo");
  });

  it("returns 401 when signed out", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/agents/yoyo"), {
      params,
    });
    expect(res.status).toBe(401);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    mockedAssert.mockRejectedValue(
      new AgentOwnershipError('Agent "yoyo" is owned by @bob; @alice cannot modify it.'),
    );
    const res = await DELETE(new Request("http://localhost/api/agents/yoyo"), {
      params,
    });
    expect(res.status).toBe(403);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when the agent does not exist", async () => {
    mockedAssert.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/agents/yoyo"), {
      params,
    });
    expect(res.status).toBe(404);
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});
