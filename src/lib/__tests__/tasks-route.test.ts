import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getServicePrincipal: vi.fn() }));
vi.mock("@/lib/reconcile", () => ({ reconcileFromTalk: vi.fn() }));
vi.mock("@/lib/ingest", () => ({
  ingest: vi.fn(),
  ingestUrl: vi.fn(),
  ingestPdf: vi.fn(),
  ingestImage: vi.fn(),
  reingest: vi.fn(),
}));
vi.mock("@/lib/lint-fix", () => ({ fixLintIssue: vi.fn() }));
vi.mock("@/lib/ingest-jobs", () => ({ updateIngestJob: vi.fn(async () => ({})) }));
vi.mock("@/lib/ingest-staging", () => ({
  readStagedBytes: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  readStagedText: vi.fn(async () => "staged pasted text"),
  deleteStaged: vi.fn(async () => {}),
}));

import { getServicePrincipal } from "@/lib/auth";
import { reconcileFromTalk } from "@/lib/reconcile";
import { ingest, ingestUrl, ingestPdf, ingestImage, reingest } from "@/lib/ingest";
import { fixLintIssue } from "@/lib/lint-fix";
import { updateIngestJob } from "@/lib/ingest-jobs";
import { readStagedBytes, readStagedText, deleteStaged } from "@/lib/ingest-staging";

const mockedGetService = vi.mocked(getServicePrincipal);
const mockedReconcile = vi.mocked(reconcileFromTalk);
const mockedIngest = vi.mocked(ingest);
const mockedIngestUrl = vi.mocked(ingestUrl);
const mockedIngestPdf = vi.mocked(ingestPdf);
const mockedIngestImage = vi.mocked(ingestImage);
const mockedReingest = vi.mocked(reingest);
const mockedFixLint = vi.mocked(fixLintIssue);
const mockedUpdateJob = vi.mocked(updateIngestJob);
const mockedReadStagedBytes = vi.mocked(readStagedBytes);
const mockedReadStagedText = vi.mocked(readStagedText);
const mockedDeleteStaged = vi.mocked(deleteStaged);

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

  it("routes a URL pdf task (source:pdf) to ingestPdf", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestPdf.mockResolvedValue({ primarySlug: "pdf-page" } as any);
    const res = await run({
      kind: "ingest",
      url: "https://x/a.pdf",
      source: "pdf",
      owner: "alice",
    });
    expect(res.status).toBe(200);
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      { pdfUrl: "https://x/a.pdf" },
      expect.objectContaining({ owner: "alice" }),
    );
    expect(mockedIngestUrl).not.toHaveBeenCalled();
  });

  it("routes a URL image task (source:image) to ingestImage", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestImage.mockResolvedValue({ primarySlug: "img-page" } as any);
    const res = await run({
      kind: "ingest",
      url: "https://x/a.png",
      source: "image",
      owner: "alice",
    });
    expect(res.status).toBe(200);
    expect(mockedIngestImage).toHaveBeenCalledWith(
      { imageUrl: "https://x/a.png" },
      expect.objectContaining({ owner: "alice" }),
    );
  });

  it("reads a staged pdf from R2, ingests it, and deletes the blob", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestPdf.mockResolvedValue({ primarySlug: "staged-pdf" } as any);
    const res = await run({
      kind: "ingest",
      owner: "alice",
      staged: { key: "raw/uploads/j/doc.pdf", kind: "pdf", filename: "doc.pdf" },
    });
    expect(res.status).toBe(200);
    expect(mockedReadStagedBytes).toHaveBeenCalledWith("raw/uploads/j/doc.pdf");
    expect(mockedIngestPdf).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "doc.pdf" }),
      expect.objectContaining({ owner: "alice" }),
    );
    // Best-effort cleanup runs after a successful ingest.
    expect(mockedDeleteStaged).toHaveBeenCalledWith("raw/uploads/j/doc.pdf");
  });

  it("forwards a user-supplied title to ingestPdf/ingestImage across the queue", async () => {
    // Regression: title rode the task but was dropped from the consumer opts, so
    // a typed PDF/image title was ignored on the production (queued) path (and
    // for images the title also drives the slug).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestPdf.mockResolvedValue({ primarySlug: "p" } as any);
    await run({ kind: "ingest", url: "https://x/a.pdf", source: "pdf", owner: "alice", title: "My Doc" });
    expect(mockedIngestPdf).toHaveBeenLastCalledWith(
      { pdfUrl: "https://x/a.pdf" },
      expect.objectContaining({ title: "My Doc" }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestImage.mockResolvedValue({ primarySlug: "i" } as any);
    await run({
      kind: "ingest",
      owner: "alice",
      title: "My Pic",
      staged: { key: "raw/uploads/j/p.png", kind: "image", filename: "p.png" },
    });
    expect(mockedIngestImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ filename: "p.png" }),
      expect.objectContaining({ title: "My Pic" }),
    );
  });

  it("reads a staged image from R2, ingests it, and deletes the blob", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngestImage.mockResolvedValue({ primarySlug: "staged-img" } as any);
    const res = await run({
      kind: "ingest",
      owner: "alice",
      staged: { key: "raw/uploads/j/p.png", kind: "image", filename: "p.png", contentType: "image/png" },
    });
    expect(res.status).toBe(200);
    expect(mockedReadStagedBytes).toHaveBeenCalledWith("raw/uploads/j/p.png");
    expect(mockedIngestImage).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "p.png", contentType: "image/png" }),
      expect.objectContaining({ owner: "alice" }),
    );
    expect(mockedDeleteStaged).toHaveBeenCalledWith("raw/uploads/j/p.png");
  });

  it("reads staged text from R2, ingests it, and deletes the blob", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedIngest.mockResolvedValue({ primarySlug: "staged-text" } as any);
    const res = await run({
      kind: "ingest",
      owner: "alice",
      title: "Big Paste",
      staged: { key: "raw/uploads/j/text.md", kind: "text" },
    });
    expect(res.status).toBe(200);
    expect(mockedReadStagedText).toHaveBeenCalledWith("raw/uploads/j/text.md");
    expect(mockedIngest).toHaveBeenCalledWith(
      "Big Paste",
      "staged pasted text",
      expect.objectContaining({ owner: "alice" }),
    );
    expect(mockedDeleteStaged).toHaveBeenCalledWith("raw/uploads/j/text.md");
  });

  it("deletes the staged blob even when the ingest throws", async () => {
    mockedIngestPdf.mockRejectedValueOnce(new Error("R2 read flaked"));
    const res = await run({
      kind: "ingest",
      owner: "alice",
      jobId: "job-x",
      staged: { key: "raw/uploads/j/doc.pdf", kind: "pdf" },
    });
    expect(res.status).toBe(500); // transient → retry
    // Cleanup still runs in the finally.
    expect(mockedDeleteStaged).toHaveBeenCalledWith("raw/uploads/j/doc.pdf");
    // The tracked job is recorded failed.
    expect(mockedUpdateJob).toHaveBeenCalledWith("job-x", {
      status: "failed",
      error: "R2 read flaked",
    });
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
