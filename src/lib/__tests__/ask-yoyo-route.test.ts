import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/lib/authz", () => ({ canReadSlug: vi.fn() }));
vi.mock("@/lib/talk", () => ({ getThread: vi.fn(), addComment: vi.fn() }));
vi.mock("@/lib/tasks", () => ({ enqueueTask: vi.fn() }));

import { getPrincipal } from "@/lib/auth";
import { canReadSlug } from "@/lib/authz";
import { getThread, addComment } from "@/lib/talk";
import { enqueueTask } from "@/lib/tasks";

const mockedGetPrincipal = vi.mocked(getPrincipal);
const mockedCanReadSlug = vi.mocked(canReadSlug);
const mockedGetThread = vi.mocked(getThread);
const mockedAddComment = vi.mocked(addComment);
const mockedEnqueue = vi.mocked(enqueueTask);

async function ask(slug: string, idx: string) {
  const { POST } = await import(
    "@/app/api/wiki/[slug]/discuss/[threadIndex]/ask-yoyo/route"
  );
  return POST(new Request("http://localhost", { method: "POST" }), {
    params: Promise.resolve({ slug, threadIndex: idx }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrincipal.mockResolvedValue({ id: "u1", handle: "alice" });
  mockedCanReadSlug.mockResolvedValue(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetThread.mockResolvedValue({ status: "open", comments: [] } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedAddComment.mockResolvedValue({} as any);
  mockedEnqueue.mockResolvedValue(true);
});

describe("POST .../discuss/[threadIndex]/ask-yoyo", () => {
  it("enqueues a reconcile task attributed to the requester (200)", async () => {
    const res = await ask("transformers", "2");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: true });
    expect(mockedEnqueue).toHaveBeenCalledWith({
      kind: "reconcile",
      slug: "transformers",
      threadIndex: 2,
      requestedBy: "alice",
    });
  });

  it("401s when signed out, without enqueuing", async () => {
    mockedGetPrincipal.mockResolvedValue(null);
    const res = await ask("p", "0");
    expect(res.status).toBe(401);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("404-cloaks a private page the caller can't read", async () => {
    mockedCanReadSlug.mockResolvedValue(false);
    const res = await ask("secret", "0");
    expect(res.status).toBe(404);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("404s a missing thread", async () => {
    mockedGetThread.mockResolvedValue(null);
    const res = await ask("p", "9");
    expect(res.status).toBe(404);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("503s when the task queue is unavailable (off-Workers)", async () => {
    mockedEnqueue.mockResolvedValue(false);
    const res = await ask("p", "0");
    expect(res.status).toBe(503);
  });

  it("400s a bad threadIndex", async () => {
    const res = await ask("p", "-1");
    expect(res.status).toBe(400);
  });
});
