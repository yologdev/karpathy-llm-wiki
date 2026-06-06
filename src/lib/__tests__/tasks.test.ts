import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the OpenNext context. Default: throws (off-Workers) → enqueue no-ops.
// Workers tests opt in by setting a return value with a TASK_QUEUE binding.
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error("no cloudflare context");
  }),
}));

import { enqueueTask, parseTask } from "../tasks";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const mockGetCfContext = getCloudflareContext as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCfContext.mockImplementation(() => {
    throw new Error("no cloudflare context");
  });
});

describe("enqueueTask", () => {
  it("no-ops (returns false) off the Workers runtime", async () => {
    const ok = await enqueueTask({ kind: "reconcile", slug: "p", threadIndex: 0 });
    expect(ok).toBe(false);
  });

  it("no-ops when the TASK_QUEUE binding is absent on the runtime", async () => {
    mockGetCfContext.mockReturnValue({ env: { AI: {} } }); // no TASK_QUEUE
    const ok = await enqueueTask({ kind: "reconcile", slug: "p", threadIndex: 0 });
    expect(ok).toBe(false);
  });

  it("sends to the queue binding and returns true when bound", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    mockGetCfContext.mockReturnValue({ env: { TASK_QUEUE: { send } } });

    const task = { kind: "reconcile" as const, slug: "transformers", threadIndex: 2 };
    const ok = await enqueueTask(task);

    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledWith(task);
  });
});

describe("parseTask", () => {
  it("accepts a well-formed reconcile task", () => {
    expect(
      parseTask({ kind: "reconcile", slug: "p", threadIndex: 3, requestedBy: "alice" }),
    ).toEqual({ kind: "reconcile", slug: "p", threadIndex: 3, requestedBy: "alice" });
  });

  it("accepts a reconcile task without requestedBy", () => {
    expect(parseTask({ kind: "reconcile", slug: "p", threadIndex: 0 })).toEqual({
      kind: "reconcile",
      slug: "p",
      threadIndex: 0,
    });
  });

  it("rejects a reconcile task with a bad slug or threadIndex", () => {
    expect(parseTask({ kind: "reconcile", slug: "", threadIndex: 0 })).toBeNull();
    expect(parseTask({ kind: "reconcile", slug: "p", threadIndex: 1.5 })).toBeNull();
    expect(parseTask({ kind: "reconcile", slug: "p" })).toBeNull();
  });

  it("accepts an ingest task with a url or content; rejects neither", () => {
    expect(parseTask({ kind: "ingest", url: "https://x.com" })).toMatchObject({
      kind: "ingest",
      url: "https://x.com",
    });
    expect(parseTask({ kind: "ingest", content: "some text" })).toMatchObject({
      kind: "ingest",
      content: "some text",
    });
    expect(parseTask({ kind: "ingest" })).toBeNull();
  });

  it("accepts maintain tasks; reconcile needs a threadIndex", () => {
    expect(parseTask({ kind: "maintain", op: "staleness", slug: "p" })).toEqual({
      kind: "maintain",
      op: "staleness",
      slug: "p",
    });
    expect(
      parseTask({ kind: "maintain", op: "reconcile", slug: "p", threadIndex: 1 }),
    ).toEqual({ kind: "maintain", op: "reconcile", slug: "p", threadIndex: 1 });
    // reconcile without a threadIndex, or a bad op, is rejected.
    expect(parseTask({ kind: "maintain", op: "reconcile", slug: "p" })).toBeNull();
    expect(parseTask({ kind: "maintain", op: "bogus", slug: "p" })).toBeNull();
    expect(parseTask({ kind: "maintain", op: "staleness", slug: "" })).toBeNull();
  });

  it("accepts maintain:fix only with an allowed (deterministic) lintType", () => {
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "unmigrated-page" }),
    ).toEqual({ kind: "maintain", op: "fix", slug: "p", lintType: "unmigrated-page" });
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "supersedes-dangling" }),
    ).toMatchObject({ op: "fix", lintType: "supersedes-dangling" });
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "orphan-page" }),
    ).toEqual({ kind: "maintain", op: "fix", slug: "p", lintType: "orphan-page" });
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "empty-page" }),
    ).toEqual({ kind: "maintain", op: "fix", slug: "p", lintType: "empty-page" });
    // A non-deterministic / unknown lint type (or none) is rejected.
    expect(parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "contradictions" })).toBeNull();
    expect(parseTask({ kind: "maintain", op: "fix", slug: "p" })).toBeNull();
  });

  it("accepts maintain:fix broken-link only with a targetSlug", () => {
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "broken-link", targetSlug: "dead" }),
    ).toEqual({
      kind: "maintain",
      op: "fix",
      slug: "p",
      lintType: "broken-link",
      targetSlug: "dead",
    });
    // broken-link without targetSlug is rejected.
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "broken-link" }),
    ).toBeNull();
    // broken-link with an empty targetSlug is rejected.
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "broken-link", targetSlug: "" }),
    ).toBeNull();
    expect(
      parseTask({ kind: "maintain", op: "fix", slug: "p", lintType: "broken-link", targetSlug: "  " }),
    ).toBeNull();
  });

  it("rejects unknown kinds and non-objects", () => {
    expect(parseTask({ kind: "nope" })).toBeNull();
    expect(parseTask(null)).toBeNull();
    expect(parseTask("string")).toBeNull();
    expect(parseTask(42)).toBeNull();
  });
});
