import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the ingest library — we only test the route's validation and wiring
// ---------------------------------------------------------------------------
vi.mock("@/lib/ingest", () => ({
  ingest: vi.fn(),
  ingestUrl: vi.fn(),
  reingest: vi.fn(),
}));

vi.mock("@/lib/wiki", () => ({
  readWikiPageWithFrontmatter: vi.fn(),
}));

vi.mock("@/lib/fetch", () => ({
  isUrl: (s: string) => s.startsWith("http://") || s.startsWith("https://"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "test-user", handle: "test-user" })),
  getServicePrincipal: vi.fn(() => null),
}));

import { ingest, ingestUrl, reingest } from "@/lib/ingest";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
import { getServicePrincipal } from "@/lib/auth";
import { POST } from "@/app/api/ingest/route";
import { POST as POST_BATCH } from "@/app/api/ingest/batch/route";
import { POST as POST_REINGEST } from "@/app/api/ingest/reingest/route";
import type { IngestResult } from "@/lib/types";

const mockedIngest = vi.mocked(ingest);
const mockedIngestUrl = vi.mocked(ingestUrl);
const mockedReingest = vi.mocked(reingest);
const mockedReadWikiPage = vi.mocked(readWikiPageWithFrontmatter);
const mockedGetPrincipal = vi.mocked(getPrincipal);
const mockedGetServicePrincipal = vi.mocked(getServicePrincipal);

function makeRequest(url: string, body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedIngest.mockReset();
  mockedIngestUrl.mockReset();
  mockedReingest.mockReset();
  mockedReadWikiPage.mockReset();
  mockedGetPrincipal.mockResolvedValue({ id: "test-user", handle: "test-user" });
  mockedGetServicePrincipal.mockReturnValue(null);
});

const fakeResult: IngestResult = {
  rawPath: "raw/test.md",
  primarySlug: "test-page",
  relatedUpdated: [],
  wikiPages: ["test-page"],
  indexUpdated: true,
};

// ===========================================================================
// POST /api/ingest — tags support
// ===========================================================================
describe("POST /api/ingest — tags", () => {
  describe("validation", () => {
    it("rejects tags that is not an array", async () => {
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: "not-an-array",
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/tags/i);
    });

    it("rejects tags containing non-string items", async () => {
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: ["valid", 123],
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/tags/i);
    });

    it("rejects tags that is a number", async () => {
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: 42,
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/tags/i);
    });

    it("accepts missing tags (undefined)", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
        }),
      );
      expect(res.status).toBe(200);
    });

    it("accepts empty tags array", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: [],
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("forwarding tags via URL path", () => {
    it("forwards tags to ingestUrl", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: ["foo", "bar"],
        }),
      );
      expect(res.status).toBe(200);
      expect(mockedIngestUrl).toHaveBeenCalledWith(
        "https://example.com/page",
        expect.objectContaining({ tags: ["foo", "bar"] }),
      );
    });

    it("does not include tags in options when empty array", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: [],
        }),
      );
      const opts = mockedIngestUrl.mock.calls[0][1];
      expect(opts).not.toHaveProperty("tags");
    });
  });

  describe("forwarding tags via text path", () => {
    it("forwards tags to ingest", async () => {
      mockedIngest.mockResolvedValue(fakeResult);
      const res = await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          title: "Test Page",
          content: "Some content here",
          tags: ["alpha"],
        }),
      );
      expect(res.status).toBe(200);
      expect(mockedIngest).toHaveBeenCalledWith(
        "Test Page",
        "Some content here",
        expect.objectContaining({ tags: ["alpha"] }),
      );
    });

    it("does not include tags in options when not provided", async () => {
      mockedIngest.mockResolvedValue(fakeResult);
      await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          title: "Test Page",
          content: "Some content here",
        }),
      );
      const opts = mockedIngest.mock.calls[0][2];
      expect(opts).not.toHaveProperty("tags");
    });
  });
});

// ===========================================================================
// POST /api/ingest/batch — tags support
// ===========================================================================
describe("POST /api/ingest/batch — tags", () => {
  describe("validation", () => {
    it("rejects tags that is not an array", async () => {
      const res = await POST_BATCH(
        makeRequest("http://localhost:3000/api/ingest/batch", {
          urls: ["https://example.com/a"],
          tags: "not-an-array",
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/tags/i);
    });

    it("rejects tags containing non-string items", async () => {
      const res = await POST_BATCH(
        makeRequest("http://localhost:3000/api/ingest/batch", {
          urls: ["https://example.com/a"],
          tags: ["ok", null],
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/tags/i);
    });

    it("accepts missing tags", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST_BATCH(
        makeRequest("http://localhost:3000/api/ingest/batch", {
          urls: ["https://example.com/a"],
        }),
      );
      // The route streams NDJSON — status 200 means it got past validation
      expect(res.status).toBe(200);
    });
  });

  describe("forwarding tags", () => {
    it("forwards tags to each ingestUrl call", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST_BATCH(
        makeRequest("http://localhost:3000/api/ingest/batch", {
          urls: ["https://example.com/a", "https://example.com/b"],
          tags: ["batch-tag"],
        }),
      );
      expect(res.status).toBe(200);

      // Consume the stream to trigger all ingestUrl calls
      const reader = res.body!.getReader();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      expect(mockedIngestUrl).toHaveBeenCalledTimes(2);
      expect(mockedIngestUrl).toHaveBeenCalledWith(
        "https://example.com/a",
        expect.objectContaining({ tags: ["batch-tag"] }),
      );
      expect(mockedIngestUrl).toHaveBeenCalledWith(
        "https://example.com/b",
        expect.objectContaining({ tags: ["batch-tag"] }),
      );
    });

    it("does not pass tags when tags is empty", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST_BATCH(
        makeRequest("http://localhost:3000/api/ingest/batch", {
          urls: ["https://example.com/a"],
          tags: [],
        }),
      );

      // Consume the stream
      const reader = res.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(mockedIngestUrl.mock.calls[0][1]).not.toHaveProperty("tags");
      expect(mockedIngestUrl.mock.calls[0][1]).toMatchObject({ author: "test-user" });
    });

    it("does not pass tags when tags is undefined", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      const res = await POST_BATCH(
        makeRequest("http://localhost:3000/api/ingest/batch", {
          urls: ["https://example.com/a"],
        }),
      );

      // Consume the stream
      const reader = res.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(mockedIngestUrl.mock.calls[0][1]).not.toHaveProperty("tags");
      expect(mockedIngestUrl.mock.calls[0][1]).toMatchObject({ author: "test-user" });
    });
  });
});

// ===========================================================================
// POST /api/ingest — service token auth
// ===========================================================================
describe("POST /api/ingest — service token auth", () => {
  const fakeResult: IngestResult = {
    rawPath: "raw/test.md",
    primarySlug: "test-page",
    relatedUpdated: [],
    wikiPages: ["test-page"],
    indexUpdated: true,
  };

  it("accepts a valid service token when Clerk session is absent", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedIngestUrl.mockResolvedValue(fakeResult);

    const res = await POST(
      makeRequest("http://localhost:3000/api/ingest", {
        url: "https://example.com/page",
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);
    expect(mockedIngestUrl).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({ author: "yopedia", owner: "yopedia" }),
    );
  });

  it("returns 401 when neither Clerk session nor service token is present", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST(
      makeRequest("http://localhost:3000/api/ingest", {
        url: "https://example.com/page",
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("returns 401 when service token is invalid (getServicePrincipal returns null)", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST(
      makeRequest("http://localhost:3000/api/ingest", {
        url: "https://example.com/page",
      }, "wrong-token"),
    );
    expect(res.status).toBe(401);
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("prefers Clerk session when both are available", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "clerk-user", handle: "alice" });
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedIngestUrl.mockResolvedValue(fakeResult);

    const res = await POST(
      makeRequest("http://localhost:3000/api/ingest", {
        url: "https://example.com/page",
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);
    // Clerk principal wins — author/owner should be "alice", not "yopedia"
    expect(mockedIngestUrl).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({ author: "alice", owner: "alice" }),
    );
  });
});

// ===========================================================================
// POST /api/ingest/batch — service token auth
// ===========================================================================
describe("POST /api/ingest/batch — service token auth", () => {
  it("accepts a valid service token when Clerk session is absent", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedIngestUrl.mockResolvedValue(fakeResult);

    const res = await POST_BATCH(
      makeRequest("http://localhost:3000/api/ingest/batch", {
        urls: ["https://example.com/page"],
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);

    // Consume the stream to trigger ingestUrl calls
    const reader = res.body!.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(mockedIngestUrl).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({ author: "yopedia", owner: "yopedia" }),
    );
  });

  it("returns 401 when neither Clerk session nor service token is present", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST_BATCH(
      makeRequest("http://localhost:3000/api/ingest/batch", {
        urls: ["https://example.com/page"],
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("returns 401 when service token is invalid", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST_BATCH(
      makeRequest("http://localhost:3000/api/ingest/batch", {
        urls: ["https://example.com/page"],
      }, "wrong-token"),
    );
    expect(res.status).toBe(401);
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("prefers Clerk session when both are available", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "clerk-user", handle: "alice" });
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedIngestUrl.mockResolvedValue(fakeResult);

    const res = await POST_BATCH(
      makeRequest("http://localhost:3000/api/ingest/batch", {
        urls: ["https://example.com/page"],
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);

    // Consume the stream
    const reader = res.body!.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    // Clerk principal wins
    expect(mockedIngestUrl).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({ author: "alice", owner: "alice" }),
    );
  });
});

// ===========================================================================
// POST /api/ingest/reingest — service token auth
// ===========================================================================
describe("POST /api/ingest/reingest — service token auth", () => {
  const fakeReingestResult: IngestResult = {
    rawPath: "raw/test.md",
    primarySlug: "test-page",
    relatedUpdated: [],
    wikiPages: ["test-page"],
    indexUpdated: true,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakePageWithFrontmatter: any = {
    content: "# Test\nHello",
    frontmatter: {
      title: "Test",
      source_url: "https://example.com/source",
    },
  };

  it("accepts a valid service token when Clerk session is absent", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedReadWikiPage.mockResolvedValue(fakePageWithFrontmatter);
    mockedReingest.mockResolvedValue(fakeReingestResult);

    const res = await POST_REINGEST(
      makeRequest("http://localhost:3000/api/ingest/reingest", {
        slug: "test-page",
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);
    expect(mockedReingest).toHaveBeenCalledWith(
      "test-page",
      expect.objectContaining({ author: "yopedia", triggeredBy: "yopedia" }),
    );
  });

  it("returns 401 when neither Clerk session nor service token is present", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST_REINGEST(
      makeRequest("http://localhost:3000/api/ingest/reingest", {
        slug: "test-page",
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedReingest).not.toHaveBeenCalled();
  });

  it("returns 401 when service token is invalid", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    mockedGetServicePrincipal.mockReturnValue(null);

    const res = await POST_REINGEST(
      makeRequest("http://localhost:3000/api/ingest/reingest", {
        slug: "test-page",
      }, "wrong-token"),
    );
    expect(res.status).toBe(401);
    expect(mockedReingest).not.toHaveBeenCalled();
  });

  it("prefers Clerk session when both are available", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "clerk-user", handle: "alice" });
    mockedGetServicePrincipal.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
    mockedReadWikiPage.mockResolvedValue(fakePageWithFrontmatter);
    mockedReingest.mockResolvedValue(fakeReingestResult);

    const res = await POST_REINGEST(
      makeRequest("http://localhost:3000/api/ingest/reingest", {
        slug: "test-page",
      }, "valid-service-token"),
    );
    expect(res.status).toBe(200);
    // Clerk principal wins
    expect(mockedReingest).toHaveBeenCalledWith(
      "test-page",
      expect.objectContaining({ author: "alice", triggeredBy: "alice" }),
    );
  });

  it("cloaks a non-owner re-ingesting a PRIVATE page (404), never calling reingest", async () => {
    mockedGetPrincipal.mockResolvedValue({ id: "clerk-user", handle: "alice" });
    mockedGetServicePrincipal.mockReturnValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bobSecretPage: any = {
      content: "# Secret",
      frontmatter: {
        title: "Secret",
        source_url: "https://example.com/source",
        owner: "bob",
        visibility: "private",
      },
    };
    mockedReadWikiPage.mockResolvedValue(bobSecretPage);

    const res = await POST_REINGEST(
      makeRequest("http://localhost:3000/api/ingest/reingest", {
        slug: "bob-secret",
      }),
    );
    // A private page the caller can't read is "not found" (no existence oracle).
    expect(res.status).toBe(404);
    expect(mockedReingest).not.toHaveBeenCalled();
  });
});
