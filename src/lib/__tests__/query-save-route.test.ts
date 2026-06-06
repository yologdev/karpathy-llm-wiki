import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock saveAnswerToWiki — we test the route's wiring, not the library
// ---------------------------------------------------------------------------
vi.mock("@/lib/query", () => ({
  saveAnswerToWiki: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "test-user", handle: "test-user" })),
}));

import { saveAnswerToWiki } from "@/lib/query";
import { POST } from "@/app/api/query/save/route";

const mockedSaveAnswer = vi.mocked(saveAnswerToWiki);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/query/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedSaveAnswer.mockReset();
  mockedSaveAnswer.mockResolvedValue({ slug: "test-page" } as ReturnType<typeof saveAnswerToWiki> extends Promise<infer T> ? T : never);
});

describe("POST /api/query/save", () => {
  it("passes sources to saveAnswerToWiki when provided", async () => {
    const sources = ["page-alpha", "page-beta"];
    const req = makeRequest({
      title: "My Answer",
      content: "Some answer content",
      sources,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockedSaveAnswer).toHaveBeenCalledWith(
      "My Answer",
      "Some answer content",
      undefined,
      sources,
    );
  });

  it("calls saveAnswerToWiki without sources when sources is omitted", async () => {
    const req = makeRequest({
      title: "No Sources",
      content: "Answer without sources",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockedSaveAnswer).toHaveBeenCalledWith(
      "No Sources",
      "Answer without sources",
      undefined,
      undefined,
    );
  });

  it("rejects non-array sources with 400", async () => {
    const req = makeRequest({
      title: "Bad Sources",
      content: "Some content",
      sources: "not-an-array",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("sources must be an array");
  });
});
