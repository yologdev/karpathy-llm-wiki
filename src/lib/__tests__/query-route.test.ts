import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/query", () => ({
  query: vi.fn(async () => ({ answer: "ok", sources: [] })),
}));
vi.mock("@/lib/auth", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { query } from "@/lib/query";
import { getPrincipal } from "@/lib/auth";
import { POST } from "@/app/api/query/route";

const mockedQuery = vi.mocked(query);
const mockedGetPrincipal = vi.mocked(getPrincipal);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a signed-in user — the middleware already guarantees this for any
  // POST /api/query, so the route's own guard passes and we exercise the body.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetPrincipal.mockResolvedValue({ handle: "tester" } as any);
});

describe("POST /api/query — format validation", () => {
  it("accepts format:'html' and threads it to query()", async () => {
    const res = await POST(makeRequest({ question: "what is A?", format: "html" }));
    expect(res.status).toBe(200);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0][1]).toBe("html"); // 2nd arg = format
  });

  it("accepts the existing formats", async () => {
    for (const f of ["prose", "table", "slides"]) {
      await POST(makeRequest({ question: "q", format: f }));
    }
    expect(mockedQuery).toHaveBeenCalledTimes(3);
  });

  it("rejects an invalid format with 400 and does not run the query", async () => {
    const res = await POST(makeRequest({ question: "q", format: "bogus" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/format must be/);
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe("POST /api/query — auth (LLM cost gate)", () => {
  it("401s an unauthenticated caller and never runs the LLM query", async () => {
    mockedGetPrincipal.mockResolvedValueOnce(null); // anonymous
    const res = await POST(makeRequest({ question: "what is A?", format: "prose" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign in/i);
    expect(mockedQuery).not.toHaveBeenCalled(); // no LLM call for anonymous
  });
});
