import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(),
  getServicePrincipal: vi.fn(() => null),
}));
vi.mock("@/lib/ingest", () => ({ ingestImage: vi.fn() }));

import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { ingestImage } from "@/lib/ingest";
import { ClientInputError } from "@/lib/errors";
import { POST } from "@/app/api/ingest/image/route";

const mockedPrincipal = vi.mocked(getPrincipal);
const mockedServicePrincipal = vi.mocked(getServicePrincipal);
const mockedIngestImage = vi.mocked(ingestImage);

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/ingest/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrincipal.mockResolvedValue({ handle: "alice", id: "alice" } as never);
  mockedIngestImage.mockResolvedValue({ primarySlug: "img", wikiPages: ["img"] } as never);
});

describe("POST /api/ingest/image", () => {
  it("401 when not signed in", async () => {
    mockedPrincipal.mockResolvedValue(null);
    const res = await POST(jsonReq({ imageUrl: "https://x/a.png" }) as never);
    expect(res.status).toBe(401);
    expect(mockedIngestImage).not.toHaveBeenCalled();
  });

  it("400 when imageUrl is missing or not a URL", async () => {
    expect((await POST(jsonReq({}) as never)).status).toBe(400);
    expect((await POST(jsonReq({ imageUrl: "not-a-url" }) as never)).status).toBe(400);
  });

  it("ingests by URL with session attribution", async () => {
    const res = await POST(jsonReq({ imageUrl: "https://x/a.png", title: "Pic" }) as never);
    expect(res.status).toBe(200);
    expect(mockedIngestImage).toHaveBeenCalledWith(
      { imageUrl: "https://x/a.png" },
      expect.objectContaining({ owner: "alice", author: "alice", title: "Pic" }),
    );
  });

  it("maps a ClientInputError (bad/unsafe/oversized image) to 400", async () => {
    mockedIngestImage.mockRejectedValue(new ClientInputError("URL is not an image"));
    const res = await POST(jsonReq({ imageUrl: "https://x/a.png" }) as never);
    expect(res.status).toBe(400);
  });

  it("maps an unexpected error (e.g. storage outage) to 500, not 400", async () => {
    mockedIngestImage.mockRejectedValue(new Error("R2 unavailable"));
    const res = await POST(jsonReq({ imageUrl: "https://x/a.png" }) as never);
    expect(res.status).toBe(500);
  });

  it("accepts service token when no Clerk session exists", async () => {
    mockedPrincipal.mockResolvedValue(null);
    mockedServicePrincipal.mockReturnValue({ id: "service:bot", handle: "bot" });
    const res = await POST(jsonReq({ imageUrl: "https://x/a.png" }) as never);
    expect(res.status).toBe(200);
    expect(mockedIngestImage).toHaveBeenCalledWith(
      { imageUrl: "https://x/a.png" },
      expect.objectContaining({ owner: "bot", author: "bot", triggeredBy: "bot" }),
    );
  });

  it("prefers Clerk session over service token", async () => {
    mockedServicePrincipal.mockReturnValue({ id: "service:bot", handle: "bot" });
    // getPrincipal returns alice (Clerk session) — should use alice, not bot
    const res = await POST(jsonReq({ imageUrl: "https://x/a.png" }) as never);
    expect(res.status).toBe(200);
    expect(mockedIngestImage).toHaveBeenCalledWith(
      { imageUrl: "https://x/a.png" },
      expect.objectContaining({ owner: "alice", author: "alice" }),
    );
  });
});
