import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// #413: the streaming query route must apply the SAME agent-scoped filter the
// non-streaming query() does — unscoped queries answer from the public commons
// only, never from agent-identity/knowledge/social pages.
// ---------------------------------------------------------------------------

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => ({ id: "u", handle: "u" })),
}));

vi.mock("@/lib/search", () => ({
  // Default to UNSCOPED; individual tests override per scope.
  resolveScopeSlugs: vi.fn(async () => ({ scopeSlugs: undefined })),
}));

vi.mock("@/lib/wiki", () => ({
  listReadableWikiPages: vi.fn(),
  // Real-ish predicates: agent-scoped types are the `agent-*` family; saved
  // artifacts are `html`.
  isAgentScopedType: (t: unknown) =>
    typeof t === "string" && t.startsWith("agent-"),
  isArtifactType: (t: unknown) => t === "html",
}));

vi.mock("@/lib/llm", () => ({
  hasLLMKey: vi.fn(() => true),
  // Empty stream so the route completes without a real LLM.
  callLLMStream: vi.fn(async function* () {}),
}));

vi.mock("@/lib/query", () => ({
  selectPagesForQuery: vi.fn(async () => ["concept-a"]),
  buildContext: vi.fn(async () => ({ context: "ctx", slugs: ["concept-a"] })),
  buildQuerySystemPrompt: vi.fn(() => "system"),
}));

import { listReadableWikiPages } from "@/lib/wiki";
import { resolveScopeSlugs } from "@/lib/search";
import { selectPagesForQuery } from "@/lib/query";
import { POST } from "@/app/api/query/stream/route";

const mockedList = vi.mocked(listReadableWikiPages);
const mockedScope = vi.mocked(resolveScopeSlugs);
const mockedSelect = vi.mocked(selectPagesForQuery);

const ENTRIES = [
  { slug: "concept-a", title: "A", summary: "", type: undefined },
  { slug: "yoyo-identity", title: "Y", summary: "", type: "agent-identity" },
  { slug: "yoyo-notes", title: "N", summary: "", type: "agent-knowledge" },
] as unknown as Awaited<ReturnType<typeof listReadableWikiPages>>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/query/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue(ENTRIES);
  mockedScope.mockResolvedValue({ scopeSlugs: undefined });
});

describe("POST /api/query/stream — agent-scope filtering (#413)", () => {
  it("excludes agent-scoped pages from an UNSCOPED query", async () => {
    await POST(makeRequest({ question: "what is A?" }));

    expect(mockedSelect).toHaveBeenCalledTimes(1);
    const passedEntries = mockedSelect.mock.calls[0][1] as Array<{ type?: string }>;
    expect(passedEntries.map((e) => e.type)).not.toContain("agent-identity");
    expect(passedEntries.map((e) => e.type)).not.toContain("agent-knowledge");
    expect(passedEntries.map((e) => (e as { slug: string }).slug)).toEqual([
      "concept-a",
    ]);
  });

  it("keeps agent-scoped pages when an agent: scope is provided", async () => {
    mockedScope.mockResolvedValue({ scopeSlugs: ["yoyo-identity", "yoyo-notes"] });

    await POST(makeRequest({ question: "what is yoyo?", scope: "agent:yoyo" }));

    expect(mockedSelect).toHaveBeenCalledTimes(1);
    const passedEntries = mockedSelect.mock.calls[0][1] as Array<{ type?: string }>;
    // Scoped query: no agent filter — the full readable set flows through.
    expect(passedEntries.map((e) => e.type)).toContain("agent-identity");
    expect(passedEntries.map((e) => e.type)).toContain("agent-knowledge");
  });

  it("excludes saved html artifacts from an unscoped query (and accepts format:html)", async () => {
    mockedList.mockResolvedValue([
      { slug: "concept-a", title: "A", summary: "", type: undefined },
      { slug: "saved-chart", title: "Chart", summary: "", type: "html" },
    ] as unknown as Awaited<ReturnType<typeof listReadableWikiPages>>);

    await POST(makeRequest({ question: "?", format: "html" }));

    expect(mockedSelect).toHaveBeenCalledTimes(1);
    const passedEntries = mockedSelect.mock.calls[0][1] as Array<{ type?: string }>;
    // The artifact's markup must never enter the LLM context.
    expect(passedEntries.map((e) => e.type)).not.toContain("html");
    expect(passedEntries.map((e) => (e as { slug: string }).slug)).toEqual([
      "concept-a",
    ]);
  });

  it("rejects an invalid format with 400", async () => {
    const res = await POST(makeRequest({ question: "?", format: "bogus" }));
    expect(res.status).toBe(400);
    expect(mockedSelect).not.toHaveBeenCalled();
  });
});
