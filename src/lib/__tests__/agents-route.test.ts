import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the agents data layer — the route only validates input and claims
// ownership; the lib layer is exercised by agents.test.ts.
// ---------------------------------------------------------------------------
vi.mock("@/lib/agents", () => ({
  listAgents: vi.fn(),
  registerAgent: vi.fn(),
  getAgent: vi.fn(),
  publicAgent: (a: unknown) => a,
}));

// The route claims ownership from the session principal.
vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "alice", handle: "alice" })),
}));

import { registerAgent, getAgent } from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { POST } from "@/app/api/agents/route";

const mockedRegister = vi.mocked(registerAgent);
const mockedGetAgent = vi.mocked(getAgent);
const mockedGetPrincipal = vi.mocked(getPrincipal);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return { id: "yoyo", name: "Yoyo", description: "An agent" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
  mockedGetAgent.mockResolvedValue(null); // no conflict by default
  mockedRegister.mockResolvedValue(undefined);
});

describe("POST /api/agents — ownership", () => {
  it("claims ownership from the session principal", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.agent.owner).toBe("alice");
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({ id: "yoyo", owner: "alice" }),
    );
  });

  it("ignores a client-supplied owner (set from session, never the body)", async () => {
    const res = await POST(makeRequest({ ...validBody(), owner: "attacker" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.agent.owner).toBe("alice");
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "alice" }),
    );
  });

  it("returns 401 when signed out, without registering", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("returns 409 when the agent already exists", async () => {
    mockedGetAgent.mockResolvedValue({
      id: "yoyo",
      name: "Yoyo",
      description: "An agent",
      owner: "bob",
      identityPages: [],
      learningPages: [],
      socialPages: [],
      registered: "2026-05-03T00:00:00.000Z",
      lastUpdated: "2026-05-03T00:00:00.000Z",
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ name: "Yoyo" }));
    expect(res.status).toBe(400);
    expect(mockedRegister).not.toHaveBeenCalled();
  });
});
