import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the agents library — we only test the route's validation and wiring
// ---------------------------------------------------------------------------
vi.mock("@/lib/agents", () => ({
  seedAgent: vi.fn(),
}));

import { seedAgent } from "@/lib/agents";
import { POST } from "@/app/api/agents/seed/route";
import type { AgentProfile } from "@/lib/types";

const mockedSeedAgent = vi.mocked(seedAgent);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    id: "yoyo",
    name: "yoyo",
    description: "A self-evolving coding agent growing up in public",
    sections: [
      {
        slug: "yoyo-identity",
        title: "yoyo — Identity",
        type: "identity",
        content: "I am yoyo, an AI coding agent...",
      },
      {
        slug: "yoyo-learnings",
        title: "yoyo — Learnings",
        type: "learnings",
        content: "## Recent Lessons...",
      },
      {
        slug: "yoyo-social-wisdom",
        title: "yoyo — Social Wisdom",
        type: "social",
        content: "## Recent Insights...",
      },
    ],
  };
}

const fakeProfile: AgentProfile = {
  id: "yoyo",
  name: "yoyo",
  description: "A self-evolving coding agent growing up in public",
  identityPages: ["yoyo-identity"],
  learningPages: ["yoyo-learnings"],
  socialPages: ["yoyo-social-wisdom"],
  registered: "2026-05-03T00:00:00.000Z",
  lastUpdated: "2026-05-03T00:00:00.000Z",
};

beforeEach(() => {
  mockedSeedAgent.mockReset();
  mockedSeedAgent.mockResolvedValue(fakeProfile);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/agents/seed", () => {
  describe("successful seed", () => {
    it("returns 201 with agent profile", async () => {
      const res = await POST(makeRequest(validBody()));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.agent).toEqual(fakeProfile);
      expect(mockedSeedAgent).toHaveBeenCalledOnce();
      expect(mockedSeedAgent).toHaveBeenCalledWith({
        id: "yoyo",
        name: "yoyo",
        description: "A self-evolving coding agent growing up in public",
        sections: validBody().sections,
      });
    });
  });

  describe("validation — top-level fields", () => {
    it("rejects missing id", async () => {
      const body = validBody();
      delete (body as Record<string, unknown>).id;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/id/i);
    });

    it("rejects empty id", async () => {
      const body = { ...validBody(), id: "" };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/id/i);
    });

    it("rejects missing name", async () => {
      const body = validBody();
      delete (body as Record<string, unknown>).name;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/name/i);
    });

    it("rejects empty name", async () => {
      const body = { ...validBody(), name: "" };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/name/i);
    });

    it("rejects missing description", async () => {
      const body = validBody();
      delete (body as Record<string, unknown>).description;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/description/i);
    });

    it("rejects missing sections", async () => {
      const body = validBody();
      delete (body as Record<string, unknown>).sections;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/sections/i);
    });

    it("rejects empty sections array", async () => {
      const body = { ...validBody(), sections: [] };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/sections/i);
    });

    it("rejects non-array sections", async () => {
      const body = { ...validBody(), sections: "not-an-array" };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/sections/i);
    });
  });

  describe("validation — section entries", () => {
    it("rejects section missing slug", async () => {
      const body = validBody();
      delete (body.sections[0] as Record<string, unknown>).slug;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/slug/i);
    });

    it("rejects section missing title", async () => {
      const body = validBody();
      delete (body.sections[0] as Record<string, unknown>).title;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/title/i);
    });

    it("rejects section with invalid type", async () => {
      const body = validBody();
      (body.sections[0] as Record<string, unknown>).type = "invalid";
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/type/i);
    });

    it("rejects section missing type", async () => {
      const body = validBody();
      delete (body.sections[0] as Record<string, unknown>).type;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/type/i);
    });

    it("rejects section missing content", async () => {
      const body = validBody();
      delete (body.sections[0] as Record<string, unknown>).content;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/content/i);
    });

    it("rejects section with empty content", async () => {
      const body = validBody();
      (body.sections[0] as Record<string, unknown>).content = "";
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/content/i);
    });
  });

  describe("error handling", () => {
    it("surfaces lib validation errors as 400", async () => {
      mockedSeedAgent.mockRejectedValue(new Error("Invalid agent ID: !!!"));
      const body = validBody();
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid agent ID/);
    });

    it("returns 500 for unexpected errors", async () => {
      mockedSeedAgent.mockRejectedValue(new Error("disk full"));
      const body = validBody();
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("disk full");
    });
  });
});
