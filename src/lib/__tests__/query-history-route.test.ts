import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the query-history lib — we test the route's validation/wiring, not the
// storage layer (covered by query-history.test.ts).
// ---------------------------------------------------------------------------
vi.mock("@/lib/query-history", () => ({
  appendQuery: vi.fn(async (entry) => ({ ...entry, id: "generated-id" })),
  listQueries: vi.fn(async () => []),
  markSaved: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "asker", handle: "asker" })),
}));

import { appendQuery } from "@/lib/query-history";
import { POST } from "@/app/api/query/history/route";

const mockedAppend = vi.mocked(appendQuery);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/query/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedAppend.mockClear();
});

describe("POST /api/query/history — format validation", () => {
  const base = { question: "q", answer: "a", sources: [] };

  it("persists a render-changing format (html)", async () => {
    const res = await POST(makeRequest({ ...base, format: "html" }));
    expect(res.status).toBe(200);
    expect(mockedAppend.mock.calls[0][0].format).toBe("html");
  });

  it("persists table and slides", async () => {
    await POST(makeRequest({ ...base, format: "table" }));
    expect(mockedAppend.mock.calls[0][0].format).toBe("table");
    mockedAppend.mockClear();
    await POST(makeRequest({ ...base, format: "slides" }));
    expect(mockedAppend.mock.calls[0][0].format).toBe("slides");
  });

  it("stores 'prose' as absent (it's the restore default)", async () => {
    const res = await POST(makeRequest({ ...base, format: "prose" }));
    expect(res.status).toBe(200);
    expect(mockedAppend.mock.calls[0][0].format).toBeUndefined();
  });

  it("drops an unrecognized/garbage format to absent", async () => {
    await POST(makeRequest({ ...base, format: "evil" }));
    expect(mockedAppend.mock.calls[0][0].format).toBeUndefined();
    mockedAppend.mockClear();
    await POST(makeRequest({ ...base, format: 42 }));
    expect(mockedAppend.mock.calls[0][0].format).toBeUndefined();
  });

  it("omitting format leaves it absent", async () => {
    await POST(makeRequest(base));
    expect(mockedAppend.mock.calls[0][0].format).toBeUndefined();
  });
});
