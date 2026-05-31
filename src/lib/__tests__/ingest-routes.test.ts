import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the ingest library — we only test the route's validation and wiring
// ---------------------------------------------------------------------------
vi.mock("@/lib/ingest", () => ({
  ingest: vi.fn(),
  ingestUrl: vi.fn(),
}));

vi.mock("@/lib/fetch", () => ({
  isUrl: (s: string) => s.startsWith("http://") || s.startsWith("https://"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { ingest, ingestUrl } from "@/lib/ingest";
import { POST } from "@/app/api/ingest/route";
import { POST as POST_BATCH } from "@/app/api/ingest/batch/route";
import type { IngestResult } from "@/lib/types";

const mockedIngest = vi.mocked(ingest);
const mockedIngestUrl = vi.mocked(ingestUrl);

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedIngest.mockReset();
  mockedIngestUrl.mockReset();
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
      expect(mockedIngestUrl).toHaveBeenCalledWith("https://example.com/page", {
        tags: ["foo", "bar"],
      });
    });

    it("does not include tags in options when empty array", async () => {
      mockedIngestUrl.mockResolvedValue(fakeResult);
      await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          url: "https://example.com/page",
          tags: [],
        }),
      );
      expect(mockedIngestUrl).toHaveBeenCalledWith("https://example.com/page", {});
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
      expect(mockedIngest).toHaveBeenCalledWith("Test Page", "Some content here", {
        tags: ["alpha"],
      });
    });

    it("does not include tags in options when not provided", async () => {
      mockedIngest.mockResolvedValue(fakeResult);
      await POST(
        makeRequest("http://localhost:3000/api/ingest", {
          title: "Test Page",
          content: "Some content here",
        }),
      );
      expect(mockedIngest).toHaveBeenCalledWith("Test Page", "Some content here", {});
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
      expect(mockedIngestUrl).toHaveBeenCalledWith("https://example.com/a", { tags: ["batch-tag"] });
      expect(mockedIngestUrl).toHaveBeenCalledWith("https://example.com/b", { tags: ["batch-tag"] });
    });

    it("does not pass options when tags is empty", async () => {
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

      expect(mockedIngestUrl).toHaveBeenCalledWith("https://example.com/a", undefined);
    });

    it("does not pass options when tags is undefined", async () => {
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

      expect(mockedIngestUrl).toHaveBeenCalledWith("https://example.com/a", undefined);
    });
  });
});
