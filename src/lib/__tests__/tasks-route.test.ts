import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getServicePrincipal: vi.fn() }));
vi.mock("@/lib/reconcile", () => ({ reconcileFromTalk: vi.fn() }));
vi.mock("@/lib/ingest", () => ({
  ingest: vi.fn(),
  ingestUrl: vi.fn(),
  reingest: vi.fn(),
}));
vi.mock("@/lib/lint-fix", () => ({ fixLintIssue: vi.fn() }));
vi.mock("@/lib/ingest-jobs", () => ({ updateIngestJob: vi.fn(async () => ({})) }));

import { getServicePrincipal } from "@/lib/auth";
import { reconcileFromTalk } from "@/lib/reconcile";
import { ingest, ingestUrl, reingest } from "@/lib/ingest";
import { fixLintIssue } from "@/lib/lint-fix";
import { updateIngestJob } from "@/lib/ingest-jobs";

const mockedGetService = vi.mocked(getServicePrincipal);
const mockedReconcile = vi.mocked(reconcileFromTalk);
const mockedIngest = vi.mocked(ingest);
const mockedIngestUrl = vi.mocked(ingestUrl);
const mockedReingest = vi.mocked(reingest);
const mockedFixLint = vi.mocked(fixLintIssue);
const mockedUpdateJob = vi.mocked(updateIngestJob);

async function run(body: unknown) {
  const { POST } = await import("@/app/api/tasks/run/route");
  return POST(
    new Request("http://localhost/api/tasks/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated as the service principal.
  mockedGetService.mockReturnValue({ id: "service:yopedia", handle: "yopedia" });
});

describe("POST /api/tasks/run", () => {
  it("401s without the service token (no other side effects)", async () => {
    mockedGetService.mockReturnValue(null);
    const res = await run({ kind: "reconcile", slug: "p", threadIndex: 0 });
    expect(res.status).toBe(401);
    expect(mockedReconcile).not.toHaveBeenCalled();
  });

  it("400s a malformed task (poison → don't retry)", async () => {
    const res = await run({ kind: "bogus" });
    expect(res.status).toBe(400);
    expect(mockedReconcile).not.toHaveBeenCalled();
  });

  it("dispatches a reconcile task, attributing to the requester's yoyo", async () => {
    mockedReconcile.mockResolvedValue({ slug: "p", changed: true, disputed: false });
    const res = await run({
      kind: "reconcile",
      slug: "p",
      threadIndex: 3,
      requestedBy: "alice",
    });
    expect(res.status).toBe(200);
    expect(mockedReconcile).toHaveBeenCalledWith("p", 3, { author: "alice--yoyo" });
  });

  it("dispatches an ingest task by URL", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestUrl.mockResolvedValue({ primarySlug: "made" } as any);
    const res = await run({ kind: "ingest", url: "https://example.com", owner: "alice" });
    expect(res.status).toBe(200);
    expect(mockedIngestUrl).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ owner: "alice" }),
    );
    expect(mockedIngest).not.toHaveBeenCalled();
  });

  it("dispatches maintain:reconcile (autonomous — generic yoyo, no requester)", async () => {
    mockedReconcile.mockResolvedValue({ slug: "d", changed: true, disputed: false });
    const res = await run({ kind: "maintain", op: "reconcile", slug: "d", threadIndex: 1 });
    expect(res.status).toBe(200);
    expect(mockedReconcile).toHaveBeenCalledWith("d", 1);
  });

  it("dispatches maintain:fix via fixLintIssue (deterministic lint fix)", async () => {
    mockedFixLint.mockResolvedValue({ success: true, slug: "p", message: "fixed" });
    const res = await run({
      kind: "maintain",
      op: "fix",
      slug: "p",
      lintType: "unmigrated-page",
    });
    expect(res.status).toBe(200);
    expect(mockedFixLint).toHaveBeenCalledWith("unmigrated-page", "p", undefined);
  });

  it("dispatches maintain:fix broken-link with targetSlug", async () => {
    mockedFixLint.mockResolvedValue({ success: true, slug: "p", message: "removed dead link" });
    const res = await run({
      kind: "maintain",
      op: "fix",
      slug: "p",
      lintType: "broken-link",
      targetSlug: "dead-page",
    });
    expect(res.status).toBe(200);
    expect(mockedFixLint).toHaveBeenCalledWith("broken-link", "p", "dead-page");
  });

  it("dispatches maintain:staleness via reingest", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedReingest.mockResolvedValue({ primarySlug: "s" } as any);
    const res = await run({ kind: "maintain", op: "staleness", slug: "s" });
    expect(res.status).toBe(200);
    expect(mockedReingest).toHaveBeenCalledWith("s", expect.objectContaining({ author: "yoyo" }));
  });

  it("drives a tracked ingest job processing → done on success", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestUrl.mockResolvedValue({ primarySlug: "made" } as any);
    const res = await run({
      kind: "ingest",
      url: "https://youtu.be/x",
      owner: "alice",
      jobId: "job-1",
    });
    expect(res.status).toBe(200);
    expect(mockedUpdateJob).toHaveBeenNthCalledWith(1, "job-1", { status: "processing" });
    expect(mockedUpdateJob).toHaveBeenNthCalledWith(2, "job-1", {
      status: "done",
      slug: "made",
    });
  });

  it("records a tracked ingest job as failed when ingest throws", async () => {
    mockedIngestUrl.mockRejectedValueOnce(new Error("LLM timeout"));
    const res = await run({
      kind: "ingest",
      url: "https://youtu.be/x",
      owner: "alice",
      jobId: "job-2",
    });
    expect(res.status).toBe(500); // transient → retry
    expect(mockedUpdateJob).toHaveBeenNthCalledWith(1, "job-2", { status: "processing" });
    expect(mockedUpdateJob).toHaveBeenNthCalledWith(2, "job-2", {
      status: "failed",
      error: "LLM timeout",
    });
  });

  it("leaves an untracked ingest task (no jobId) alone — no job writes", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestUrl.mockResolvedValue({ primarySlug: "made" } as any);
    await run({ kind: "ingest", url: "https://example.com", owner: "alice" });
    expect(mockedUpdateJob).not.toHaveBeenCalled();
  });

  it("maps a 'not found' failure to 422 (poison), other failures to 500 (retry)", async () => {
    mockedReconcile.mockRejectedValueOnce(new Error('page "x" not found'));
    expect((await run({ kind: "reconcile", slug: "x", threadIndex: 0 })).status).toBe(422);

    mockedReconcile.mockRejectedValueOnce(new Error("LLM timeout"));
    expect((await run({ kind: "reconcile", slug: "x", threadIndex: 0 })).status).toBe(500);
  });
});
