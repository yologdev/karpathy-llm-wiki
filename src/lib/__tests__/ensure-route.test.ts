import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents", () => ({
  forkAgent: vi.fn(),
  baseAgentId: vi.fn(() => "yopedia-yoyo"),
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "alice", handle: "alice" })),
}));

import { forkAgent, baseAgentId } from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { POST } from "@/app/api/agents/ensure/route";
import type { AgentProfile } from "@/lib/types";

const mockedFork = vi.mocked(forkAgent);
const mockedBaseId = vi.mocked(baseAgentId);
const mockedGetPrincipal = vi.mocked(getPrincipal);

const aliceYoyo: AgentProfile = {
  id: "alice-yoyo",
  name: "Yoyo",
  description: "Base yoyo",
  owner: "alice",
  template: "yopedia-yoyo",
  identityPages: [],
  learningPages: [],
  socialPages: [],
  registered: "2026-06-03T00:00:00.000Z",
  lastUpdated: "2026-06-03T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
  mockedBaseId.mockReturnValue("yopedia-yoyo");
  mockedFork.mockResolvedValue(aliceYoyo);
});

describe("POST /api/agents/ensure", () => {
  it("forks the base into the user's own yoyo", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provisioned).toBe(true);
    expect(data.agent.id).toBe("alice-yoyo");
    expect(mockedFork).toHaveBeenCalledWith({
      owner: "alice",
      templateId: "yopedia-yoyo",
    });
  });

  it("returns 401 when signed out, without forking", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockedFork).not.toHaveBeenCalled();
  });

  it("reports provisioned:false when the base isn't seeded yet", async () => {
    mockedFork.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provisioned).toBe(false);
  });
});
