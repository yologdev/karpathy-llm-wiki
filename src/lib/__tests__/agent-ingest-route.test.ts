import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents", () => ({
  verifyAgentToken: vi.fn(),
  addAgentLearningPage: vi.fn(),
}));

vi.mock("@/lib/ingest", () => ({
  ingestUrl: vi.fn(),
  ingest: vi.fn(),
}));

import { verifyAgentToken, addAgentLearningPage } from "@/lib/agents";
import { ingestUrl, ingest } from "@/lib/ingest";
import { POST } from "@/app/api/agents/[id]/ingest/route";

const mockedVerify = vi.mocked(verifyAgentToken);
const mockedAddLearning = vi.mocked(addAgentLearningPage);
const mockedIngestUrl = vi.mocked(ingestUrl);
const mockedIngest = vi.mocked(ingest);

const params = Promise.resolve({ id: "alice--yoyo" });

function req(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/agents/alice--yoyo/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedVerify.mockResolvedValue("alice--yoyo");
  mockedAddLearning.mockResolvedValue();
  mockedIngestUrl.mockResolvedValue({
    primarySlug: "ingested-page",
    relatedUpdated: [],
    wikiPages: ["ingested-page"],
    indexUpdated: true,
    rawPath: "raw/x",
  });
  mockedIngest.mockResolvedValue({
    primarySlug: "text-page",
    relatedUpdated: [],
    wikiPages: ["text-page"],
    indexUpdated: true,
    rawPath: "raw/y",
  });
});

describe("POST /api/agents/[id]/ingest", () => {
  it("ingests a URL as the agent (scoped) and attaches it to learnings", async () => {
    const res = await POST(req({ url: "https://example.com" }, "alice--yoyo.s"), {
      params,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).slug).toBe("ingested-page");
    expect(mockedIngestUrl).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        author: "alice--yoyo",
        owner: "alice--yoyo",
        pageType: "agent-knowledge",
      }),
    );
    expect(mockedAddLearning).toHaveBeenCalledWith("alice--yoyo", "ingested-page");
  });

  it("ingests text", async () => {
    const res = await POST(
      req({ text: "hello", title: "Note" }, "alice--yoyo.s"),
      { params },
    );
    expect(res.status).toBe(200);
    expect(mockedIngest).toHaveBeenCalledWith(
      "Note",
      "hello",
      expect.objectContaining({ pageType: "agent-knowledge" }),
    );
  });

  it("401 without a bearer token", async () => {
    const res = await POST(req({ url: "https://example.com" }), { params });
    expect(res.status).toBe(401);
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("401 for an invalid token", async () => {
    mockedVerify.mockResolvedValue(null);
    const res = await POST(req({ url: "https://example.com" }, "bad"), { params });
    expect(res.status).toBe(401);
  });

  it("403 when the token authenticates a different agent", async () => {
    mockedVerify.mockResolvedValue("bob--yoyo");
    const res = await POST(req({ url: "https://example.com" }, "bob--yoyo.s"), {
      params,
    });
    expect(res.status).toBe(403);
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("400 when neither url nor text is provided", async () => {
    const res = await POST(req({}, "alice--yoyo.s"), { params });
    expect(res.status).toBe(400);
  });
});
