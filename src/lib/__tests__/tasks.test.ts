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

  it("accepts an ingest task with only a staged descriptor (no url/content)", () => {
    expect(
      parseTask({
        kind: "ingest",
        staged: { key: "raw/uploads/job/document.pdf", kind: "pdf", filename: "doc.pdf" },
        jobId: "j1",
      }),
    ).toMatchObject({
      kind: "ingest",
      staged: { key: "raw/uploads/job/document.pdf", kind: "pdf", filename: "doc.pdf" },
      jobId: "j1",
    });
    // text staged kind is also valid (oversized paste).
    expect(
      parseTask({ kind: "ingest", staged: { key: "raw/uploads/j/text.md", kind: "text" } }),
    ).toMatchObject({ kind: "ingest", staged: { key: "raw/uploads/j/text.md", kind: "text" } });
  });

  it("preserves agent ingest fields (pageType, triggeredBy, sourceUrl, sourceType, learningFor)", () => {
    expect(
      parseTask({
        kind: "ingest",
        content: "note",
        owner: "alice--yoyo",
        author: "alice--yoyo",
        triggeredBy: "alice--yoyo",
        pageType: "agent-knowledge",
        sourceUrl: "https://example.com/post",
        sourceType: "text",
        learningFor: "alice--yoyo",
      }),
    ).toMatchObject({
      kind: "ingest",
      pageType: "agent-knowledge",
      triggeredBy: "alice--yoyo",
      sourceUrl: "https://example.com/post",
      sourceType: "text",
      learningFor: "alice--yoyo",
    });
    // Invalid pageType / sourceType, and empty/whitespace string fields, are
    // dropped (not trusted from the queue).
    const bad = parseTask({
      kind: "ingest",
      content: "x",
      pageType: "evil",
      sourceType: "bogus",
      triggeredBy: "",
      sourceUrl: "   ",
      learningFor: "",
    });
    expect(bad).not.toHaveProperty("pageType");
    expect(bad).not.toHaveProperty("sourceType");
    expect(bad).not.toHaveProperty("triggeredBy");
    expect(bad).not.toHaveProperty("sourceUrl");
    expect(bad).not.toHaveProperty("learningFor");
  });

  it("rejects a malformed staged descriptor", () => {
    // Empty key, bad kind, or non-object → staged dropped; with no url/content → null.
    expect(parseTask({ kind: "ingest", staged: { key: "", kind: "pdf" } })).toBeNull();
    expect(parseTask({ kind: "ingest", staged: { key: "k", kind: "video" } })).toBeNull();
    expect(parseTask({ kind: "ingest", staged: "nope" })).toBeNull();
    // A bad staged but a valid url still parses (staged simply dropped).
    expect(
      parseTask({ kind: "ingest", url: "https://x.com", staged: { key: "", kind: "pdf" } }),
    ).toMatchObject({ kind: "ingest", url: "https://x.com" });
  });

  it("rejects incoherent source combinations (enforced invariant, not branch-order)", () => {
    // `staged` is exclusive — it's its own source; pairing it with url/content is
    // ambiguous (the consumer would silently prefer staged).
    expect(
      parseTask({ kind: "ingest", url: "https://x", staged: { key: "raw/uploads/j/d.pdf", kind: "pdf" } }),
    ).toBeNull();
    expect(
      parseTask({ kind: "ingest", content: "hi", staged: { key: "raw/uploads/j/t.md", kind: "text" } }),
    ).toBeNull();
    // `source` only qualifies a url — a source with no url is inert/incoherent.
    expect(parseTask({ kind: "ingest", content: "hi", source: "pdf" })).toBeNull();
  });

  it("preserves a source discriminator for URL-based pdf/image", () => {
    expect(
      parseTask({ kind: "ingest", url: "https://x/a.pdf", source: "pdf" }),
    ).toMatchObject({ kind: "ingest", url: "https://x/a.pdf", source: "pdf" });
    expect(
      parseTask({ kind: "ingest", url: "https://x/a.png", source: "image" }),
    ).toMatchObject({ kind: "ingest", url: "https://x/a.png", source: "image" });
    // An unknown source value is dropped, not preserved.
    expect(parseTask({ kind: "ingest", url: "https://x.com", source: "audio" })).not.toHaveProperty(
      "source",
    );
  });

  it("preserves a jobId on an ingest task (async status tracking)", () => {
    expect(
      parseTask({ kind: "ingest", url: "https://youtu.be/x", jobId: "job-1" }),
    ).toMatchObject({ kind: "ingest", url: "https://youtu.be/x", jobId: "job-1" });
    // No jobId → absent (not undefined-key noise).
    expect(parseTask({ kind: "ingest", url: "https://x.com" })).not.toHaveProperty(
      "jobId",
    );
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

  it("preserves vaultId on an ingest task when present", () => {
    expect(
      parseTask({ kind: "ingest", url: "https://example.com", vaultId: "tenant--my-vault" }),
    ).toMatchObject({ kind: "ingest", url: "https://example.com", vaultId: "tenant--my-vault" });
  });

  it("strips vaultId when empty or non-string", () => {
    expect(
      parseTask({ kind: "ingest", url: "https://example.com", vaultId: "" }),
    ).not.toHaveProperty("vaultId");
    expect(
      parseTask({ kind: "ingest", url: "https://example.com", vaultId: "   " }),
    ).not.toHaveProperty("vaultId");
    expect(
      parseTask({ kind: "ingest", url: "https://example.com", vaultId: 42 }),
    ).not.toHaveProperty("vaultId");
  });

  it("omits vaultId from the parsed task when not provided", () => {
    expect(parseTask({ kind: "ingest", url: "https://x.com" })).not.toHaveProperty("vaultId");
  });
});
