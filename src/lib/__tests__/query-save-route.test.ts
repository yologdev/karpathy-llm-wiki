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
import { getPrincipal } from "@/lib/auth";
import { POST } from "@/app/api/query/save/route";

const mockedSaveAnswer = vi.mocked(saveAnswerToWiki);
const mockedGetPrincipal = vi.mocked(getPrincipal);

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
  mockedGetPrincipal.mockResolvedValue({ id: "test-user", handle: "test-user" });
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
      "markdown",
      undefined,
      undefined,
    );
    // A markdown save is a public commons page → /wiki/<slug>.
    expect((await res.json()).url).toBe("/wiki/test-page");
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
      "markdown",
      undefined,
      undefined,
    );
  });

  it("saves an HTML answer as an artifact owned by the asker", async () => {
    const req = makeRequest({
      title: "Chart",
      content: "<!doctype html><html><body>x</body></html>",
      format: "html",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockedSaveAnswer).toHaveBeenCalledWith(
      "Chart",
      "<!doctype html><html><body>x</body></html>",
      undefined,
      undefined,
      "html",
      "test-user",
      "test-user",
    );
    // The HTML artifact lives at the owner-scoped URL (it 404s at /wiki/<slug>).
    expect((await res.json()).url).toBe("/u/test-user/test-page");
  });

  it("saves a slides answer as an artifact owned by the asker", async () => {
    const deck = "---\nmarp: true\n---\n# Deck\n\n- point";
    const req = makeRequest({ title: "Deck", content: deck, format: "slides" });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockedSaveAnswer).toHaveBeenCalledWith(
      "Deck",
      deck,
      undefined,
      undefined,
      "slides",
      "test-user",
      "test-user",
    );
    // Like HTML, a slide deck is an owned artifact at the owner-scoped URL.
    expect((await res.json()).url).toBe("/u/test-user/test-page");
  });

  it("rejects a slides save with 401 when the principal can't be resolved", async () => {
    mockedGetPrincipal.mockResolvedValueOnce(null);
    const req = makeRequest({
      title: "Deck",
      content: "---\nmarp: true\n---\n# Deck",
      format: "slides",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockedSaveAnswer).not.toHaveBeenCalled();
  });

  it("normalizes the owner handle into the artifact url tenant (case-insensitive)", async () => {
    mockedGetPrincipal.mockResolvedValueOnce({ id: "u", handle: "Test-User" });
    const req = makeRequest({
      title: "Chart",
      content: "<!doctype html><html><body>x</body></html>",
      format: "html",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // ownerToTenant lowercases the handle → the link must resolve, not 404.
    expect((await res.json()).url).toBe("/u/test-user/test-page");
  });

  it("rejects an HTML save with 401 when the principal can't be resolved", async () => {
    mockedGetPrincipal.mockResolvedValueOnce(null);
    const req = makeRequest({
      title: "Chart",
      content: "<!doctype html><html><body>x</body></html>",
      format: "html",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    // No mis-attributed system-owned artifact is written.
    expect(mockedSaveAnswer).not.toHaveBeenCalled();
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
