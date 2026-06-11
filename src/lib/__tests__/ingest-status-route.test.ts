import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ingest-jobs", async (importActual) => ({
  // Keep the real (pure) effectiveStatus; only stub the storage-backed read.
  ...(await importActual<typeof import("@/lib/ingest-jobs")>()),
  getIngestJob: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getIngestJob } from "@/lib/ingest-jobs";
import { getPrincipal } from "@/lib/auth";
import { GET } from "@/app/api/ingest/status/[jobId]/route";

const mockedGetJob = vi.mocked(getIngestJob);
const mockedGetPrincipal = vi.mocked(getPrincipal);

const call = (jobId: string) =>
  GET(new Request("http://localhost/api/ingest/status/" + jobId), {
    params: Promise.resolve({ jobId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "alice", handle: "alice" });
});

describe("GET /api/ingest/status/[jobId]", () => {
  it("401 when not signed in", async () => {
    mockedGetPrincipal.mockResolvedValueOnce(null);
    expect((await call("j1")).status).toBe(401);
  });

  it("404 when the job is missing", async () => {
    mockedGetJob.mockResolvedValue(null);
    expect((await call("j1")).status).toBe(404);
  });

  it("404 when the job is owned by someone else (no existence leak)", async () => {
    mockedGetJob.mockResolvedValue({
      jobId: "j1",
      url: "u",
      owner: "bob",
      status: "done",
      slug: "s",
      createdAt: "",
      updatedAt: "",
    });
    expect((await call("j1")).status).toBe(404);
  });

  it("returns the status to the owner", async () => {
    mockedGetJob.mockResolvedValue({
      jobId: "j1",
      url: "https://youtu.be/x",
      owner: "alice",
      status: "done",
      slug: "my-page",
      createdAt: "",
      updatedAt: "",
    });
    const res = await call("j1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "done", slug: "my-page" });
  });

  it("reports a long-stalled processing job as failed (dead worker)", async () => {
    mockedGetJob.mockResolvedValue({
      jobId: "j1",
      url: "https://youtu.be/x",
      owner: "alice",
      status: "processing",
      createdAt: "",
      updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    const res = await call("j1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.error).toMatch(/stalled/i);
  });
});
