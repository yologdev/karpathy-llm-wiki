import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the ingest library — we only test the route's validation and wiring
// ---------------------------------------------------------------------------
vi.mock("@/lib/ingest", () => ({
  ingestXMention: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "test-user", handle: "test-user" })),
  getServicePrincipal: vi.fn(() => null),
}));

import { ingestXMention } from "@/lib/ingest";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { POST } from "@/app/api/ingest/x-mention/route";
import type { IngestResult } from "@/lib/types";

const mockedIngestXMention = vi.mocked(ingestXMention);
const mockedGetPrincipal = vi.mocked(getPrincipal);
const mockedGetServicePrincipal = vi.mocked(getServicePrincipal);

function makeRequest(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/ingest/x-mention", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedIngestXMention.mockReset();
  mockedGetPrincipal.mockResolvedValue({ id: "test-user", handle: "test-user" });
  mockedGetServicePrincipal.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------
describe("POST /api/ingest/x-mention", () => {
  describe("validation", () => {
    it("rejects missing url", async () => {
      const res = await POST(makeRequest({ triggeredBy: "@yoyo" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/url/i);
    });

    it("rejects empty url", async () => {
      const res = await POST(makeRequest({ url: "", triggeredBy: "@yoyo" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/url/i);
    });

    it("rejects non-string url", async () => {
      const res = await POST(makeRequest({ url: 123, triggeredBy: "@yoyo" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/url/i);
    });

    it("rejects non-X domain URL", async () => {
      const res = await POST(
        makeRequest({ url: "https://example.com/post/123", triggeredBy: "@yoyo" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/x\.com|twitter\.com/i);
    });

    it("rejects missing triggeredBy", async () => {
      const res = await POST(
        makeRequest({ url: "https://x.com/user/status/123" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/triggeredBy/i);
    });

    it("rejects empty triggeredBy", async () => {
      const res = await POST(
        makeRequest({ url: "https://x.com/user/status/123", triggeredBy: "" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/triggeredBy/i);
    });

    it("rejects non-string triggeredBy", async () => {
      const res = await POST(
        makeRequest({ url: "https://x.com/user/status/123", triggeredBy: 42 }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/triggeredBy/i);
    });
  });

  // ---------------------------------------------------------------------------
  // URL acceptance tests — both x.com and twitter.com
  // ---------------------------------------------------------------------------
  describe("URL domain acceptance", () => {
    const fakeResult: IngestResult = {
      rawPath: "raw/test.md",
      primarySlug: "test-post",
      relatedUpdated: [],
      wikiPages: ["test-post"],
      indexUpdated: true,
      sourceUrl: "https://x.com/user/status/123",
    };

    beforeEach(() => {
      mockedIngestXMention.mockResolvedValue(fakeResult);
    });

    it("accepts https://x.com URL", async () => {
      const res = await POST(
        makeRequest({ url: "https://x.com/user/status/123", triggeredBy: "@yoyo" }),
      );
      expect(res.status).toBe(200);
    });

    it("accepts https://twitter.com URL", async () => {
      const res = await POST(
        makeRequest({
          url: "https://twitter.com/user/status/456",
          triggeredBy: "@yoyo",
        }),
      );
      expect(res.status).toBe(200);
    });

    it("accepts https://www.x.com URL", async () => {
      const res = await POST(
        makeRequest({
          url: "https://www.x.com/user/status/789",
          triggeredBy: "@yoyo",
        }),
      );
      expect(res.status).toBe(200);
    });

    it("accepts http://x.com URL", async () => {
      const res = await POST(
        makeRequest({ url: "http://x.com/user/status/000", triggeredBy: "@yoyo" }),
      );
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Success path
  // ---------------------------------------------------------------------------
  describe("success", () => {
    const fakeResult: IngestResult = {
      rawPath: "raw/ai-thoughts.md",
      primarySlug: "ai-thoughts",
      relatedUpdated: ["machine-learning"],
      wikiPages: ["ai-thoughts", "machine-learning"],
      indexUpdated: true,
      sourceUrl: "https://x.com/karpathy/status/12345",
    };

    it("returns 200 and IngestResult on success", async () => {
      mockedIngestXMention.mockResolvedValue(fakeResult);

      const res = await POST(
        makeRequest({
          url: "https://x.com/karpathy/status/12345",
          triggeredBy: "@yoyo",
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.primarySlug).toBe("ai-thoughts");
      expect(data.wikiPages).toEqual(["ai-thoughts", "machine-learning"]);
      expect(data.indexUpdated).toBe(true);
    });

    it("passes trimmed url and triggeredBy to ingestXMention", async () => {
      mockedIngestXMention.mockResolvedValue(fakeResult);

      await POST(
        makeRequest({
          url: "  https://x.com/user/status/999  ",
          triggeredBy: "  @someone  ",
        }),
      );

      expect(mockedIngestXMention).toHaveBeenCalledWith(
        "https://x.com/user/status/999",
        "@someone",
        { author: "test-user", owner: "test-user" },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error path
  // ---------------------------------------------------------------------------
  describe("error handling", () => {
    it("returns 500 when ingestXMention throws", async () => {
      mockedIngestXMention.mockRejectedValue(new Error("fetch failed"));

      const res = await POST(
        makeRequest({
          url: "https://x.com/user/status/123",
          triggeredBy: "@yoyo",
        }),
      );

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toMatch(/fetch failed/);
    });
  });
});

// ===========================================================================
// POST /api/ingest/x-mention — service token auth
// ===========================================================================
describe("POST /api/ingest/x-mention — service token auth", () => {
  const fakeResult: IngestResult = {
    rawPath: "raw/test.md",
    primarySlug: "test-post",
    relatedUpdated: [],
    wikiPages: ["test-post"],
    indexUpdated: true,
    sourceUrl: "https://x.com/user/status/123",
  };

  it("accepts a valid service token when Clerk session is absent", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedIngestXMention.mockResolvedValue(fakeResult);

    const res = await POST(
      makeRequest({
        url: "https://x.com/user/status/123",
        triggeredBy: "@someone",
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);
    expect(mockedIngestXMention).toHaveBeenCalledWith(
      "https://x.com/user/status/123",
      "@someone",
      { author: "yopedia", owner: "yopedia" },
    );
  });

  it("returns 401 when neither Clerk session nor service token is present", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST(
      makeRequest({
        url: "https://x.com/user/status/123",
        triggeredBy: "@someone",
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedIngestXMention).not.toHaveBeenCalled();
  });

  it("returns 401 when service token is invalid (getServicePrincipal returns null)", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST(
      makeRequest({
        url: "https://x.com/user/status/123",
        triggeredBy: "@someone",
      }, "wrong-token"),
    );
    expect(res.status).toBe(401);
    expect(mockedIngestXMention).not.toHaveBeenCalled();
  });

  it("prefers Clerk session when both are available", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "clerk-user", handle: "alice" });
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedIngestXMention.mockResolvedValue(fakeResult);

    const res = await POST(
      makeRequest({
        url: "https://x.com/user/status/123",
        triggeredBy: "@someone",
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);
    // Clerk principal wins — author/owner should be "alice", not "yopedia"
    expect(mockedIngestXMention).toHaveBeenCalledWith(
      "https://x.com/user/status/123",
      "@someone",
      { author: "alice", owner: "alice" },
    );
  });
});
