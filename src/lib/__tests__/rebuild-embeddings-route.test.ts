import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getServicePrincipal: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ rebuildVectorStore: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { getServicePrincipal } from "@/lib/auth";
import { rebuildVectorStore } from "@/lib/embeddings";

const mockedGetService = vi.mocked(getServicePrincipal);
const mockedRebuild = vi.mocked(rebuildVectorStore);

async function post() {
  const { POST } = await import("@/app/api/admin/rebuild-embeddings/route");
  return POST(
    new Request("http://localhost/api/admin/rebuild-embeddings", { method: "POST" }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetService.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
  mockedRebuild.mockResolvedValue({ total: 3, embedded: 3, skipped: 0, model: "@cf/baai/bge-m3" });
});

describe("POST /api/admin/rebuild-embeddings", () => {
  it("401s without the service token (and does not rebuild)", async () => {
    mockedGetService.mockReturnValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockedRebuild).not.toHaveBeenCalled();
  });

  it("rebuilds and returns the result for a valid service token", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ embedded: 3, model: "@cf/baai/bge-m3" });
    expect(mockedRebuild).toHaveBeenCalledOnce();
  });

  it("maps a missing-provider error to 400", async () => {
    mockedRebuild.mockRejectedValue(new Error("No embedding provider configured."));
    const res = await post();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/No embedding provider/) });
  });

  it("maps an unexpected error to 500", async () => {
    mockedRebuild.mockRejectedValue(new Error("vectorize upsert failed"));
    const res = await post();
    expect(res.status).toBe(500);
  });
});
