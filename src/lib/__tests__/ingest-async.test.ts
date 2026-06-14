import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tasks", () => ({ enqueueTask: vi.fn() }));
vi.mock("@/lib/ingest-jobs", () => ({ updateIngestJob: vi.fn(async () => null) }));

import { enqueueTask } from "@/lib/tasks";
import { updateIngestJob } from "@/lib/ingest-jobs";
import { enqueueOrInline } from "@/lib/ingest-async";

const mockedEnqueue = vi.mocked(enqueueTask);
const mockedUpdate = vi.mocked(updateIngestJob);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpdate.mockResolvedValue(null);
});

const task = { kind: "ingest" as const, url: "https://x/a", jobId: "j1" };

describe("enqueueOrInline", () => {
  it("enqueued → returns {queued,jobId} and does NOT run inline", async () => {
    mockedEnqueue.mockResolvedValue(true);
    const inline = vi.fn();
    const res = await enqueueOrInline("j1", task, inline);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true, jobId: "j1" });
    expect(inline).not.toHaveBeenCalled();
  });

  it("queue absent → runs inline, marks job done, returns the slug", async () => {
    mockedEnqueue.mockResolvedValue(false);
    const res = await enqueueOrInline("j1", task, async () => ({ primarySlug: "page-a" }));
    expect(await res.json()).toEqual({ queued: true, jobId: "j1", slug: "page-a" });
    expect(mockedUpdate).toHaveBeenCalledWith("j1", { status: "done", slug: "page-a" });
  });

  it("enqueue THROWS → marks job failed and rethrows (no stuck 'queued')", async () => {
    mockedEnqueue.mockRejectedValue(new Error("queue down"));
    await expect(enqueueOrInline("j1", task, vi.fn())).rejects.toThrow("queue down");
    expect(mockedUpdate).toHaveBeenCalledWith(
      "j1",
      expect.objectContaining({ status: "failed", error: expect.stringContaining("queue down") }),
    );
  });

  it("inline THROWS (queue absent) → marks job failed and rethrows", async () => {
    mockedEnqueue.mockResolvedValue(false);
    const inline = vi.fn().mockRejectedValue(new Error("synthesis failed"));
    await expect(enqueueOrInline("j1", task, inline)).rejects.toThrow("synthesis failed");
    expect(mockedUpdate).toHaveBeenCalledWith(
      "j1",
      expect.objectContaining({ status: "failed", error: expect.stringContaining("synthesis failed") }),
    );
    // It must NOT then mark done.
    expect(mockedUpdate).not.toHaveBeenCalledWith("j1", expect.objectContaining({ status: "done" }));
  });
});
