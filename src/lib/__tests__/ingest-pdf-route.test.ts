import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(),
  getServicePrincipal: vi.fn(() => null),
}));
vi.mock("@/lib/ingest", () => ({ ingestPdf: vi.fn() }));

import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { ingestPdf } from "@/lib/ingest";
import { ClientInputError } from "@/lib/errors";
import { POST } from "@/app/api/ingest/pdf/route";

const mockedPrincipal = vi.mocked(getPrincipal);
const mockedServicePrincipal = vi.mocked(getServicePrincipal);
const mockedIngestPdf = vi.mocked(ingestPdf);

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/ingest/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrincipal.mockResolvedValue({ handle: "alice", id: "alice" } as never);
  mockedIngestPdf.mockResolvedValue({ primarySlug: "doc", wikiPages: ["doc"] } as never);
});

describe("POST /api/ingest/pdf", () => {
  it("401 when not signed in", async () => {
    mockedPrincipal.mockResolvedValue(null);
    const res = await POST(jsonReq({ pdfUrl: "https://example.com/doc.pdf" }) as never);
    expect(res.status).toBe(401);
    expect(mockedIngestPdf).not.toHaveBeenCalled();
  });

  it("400 when pdfUrl is missing or not a URL", async () => {
    expect((await POST(jsonReq({}) as never)).status).toBe(400);
    expect((await POST(jsonReq({ pdfUrl: "not-a-url" }) as never)).status).toBe(400);
  });

  it("ingests by URL with session attribution", async () => {
    const res = await POST(jsonReq({ pdfUrl: "https://example.com/doc.pdf", title: "My Doc" }) as never);
    expect(res.status).toBe(200);
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      { pdfUrl: "https://example.com/doc.pdf" },
      expect.objectContaining({ owner: "alice", author: "alice", title: "My Doc" }),
    );
  });

  it("passes tags from JSON body", async () => {
    await POST(jsonReq({ pdfUrl: "https://example.com/doc.pdf", tags: ["research", "ai"] }) as never);
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      { pdfUrl: "https://example.com/doc.pdf" },
      expect.objectContaining({ tags: ["research", "ai"] }),
    );
  });

  it("maps a ClientInputError (empty text layer / oversized) to 400", async () => {
    mockedIngestPdf.mockRejectedValue(new ClientInputError("PDF has no extractable text layer."));
    const res = await POST(jsonReq({ pdfUrl: "https://example.com/scanned.pdf" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no extractable text layer");
  });

  it("maps an unexpected error (e.g. storage outage) to 500, not 400", async () => {
    mockedIngestPdf.mockRejectedValue(new Error("R2 unavailable"));
    const res = await POST(jsonReq({ pdfUrl: "https://example.com/doc.pdf" }) as never);
    expect(res.status).toBe(500);
  });

  it("ingests via multipart file upload", async () => {
    const file = new File(["fake-pdf-bytes"], "report.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.append("file", file);
    form.append("title", "My Report");

    const req = new Request("http://localhost/api/ingest/pdf", {
      method: "POST",
      body: form,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "report.pdf" }),
      expect.objectContaining({ owner: "alice", author: "alice", title: "My Report" }),
    );
  });

  it("400 when multipart file is missing", async () => {
    const form = new FormData();
    const req = new Request("http://localhost/api/ingest/pdf", {
      method: "POST",
      body: form,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("accepts service token when no Clerk session exists", async () => {
    mockedPrincipal.mockResolvedValue(null);
    mockedServicePrincipal.mockReturnValue({ id: "service:bot", handle: "bot" });
    const res = await POST(jsonReq({ pdfUrl: "https://example.com/doc.pdf" }) as never);
    expect(res.status).toBe(200);
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      { pdfUrl: "https://example.com/doc.pdf" },
      expect.objectContaining({ owner: "bot", author: "bot", triggeredBy: "bot" }),
    );
  });

  it("prefers Clerk session over service token", async () => {
    mockedServicePrincipal.mockReturnValue({ id: "service:bot", handle: "bot" });
    // getPrincipal returns alice (Clerk session) — should use alice, not bot
    const res = await POST(jsonReq({ pdfUrl: "https://example.com/doc.pdf" }) as never);
    expect(res.status).toBe(200);
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      { pdfUrl: "https://example.com/doc.pdf" },
      expect.objectContaining({ owner: "alice", author: "alice" }),
    );
  });
});
