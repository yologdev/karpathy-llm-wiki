import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
}));
vi.mock("@/lib/illustration", () => ({
  generateYoyoIllustration: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
}));

import { getPrincipal } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateYoyoIllustration } from "@/lib/illustration";
import { POST } from "@/app/api/illustrate/route";

const mockedPrincipal = vi.mocked(getPrincipal);
const mockedRateLimit = vi.mocked(enforceRateLimit);
const mockedGenerate = vi.mocked(generateYoyoIllustration);

function post(body: unknown): Request {
  return new Request("http://localhost/api/illustrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrincipal.mockResolvedValue({ id: "u1", handle: "alice" });
  mockedRateLimit.mockResolvedValue({ allowed: true, remaining: 1 });
  mockedGenerate.mockResolvedValue("data:image/jpeg;base64,AAAA");
});

describe("POST /api/illustrate", () => {
  it("401s when there's no principal", async () => {
    mockedPrincipal.mockResolvedValue(null);
    const res = await POST(post({ scene: "yoyo waves" }));
    expect(res.status).toBe(401);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("429s when rate-limited — WITHOUT calling the paid image API", async () => {
    mockedRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(post({ scene: "yoyo waves" }));
    expect(res.status).toBe(429);
    // The guard must short-circuit before the paid call.
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedRateLimit).toHaveBeenCalledWith("illustrate", "u1");
  });

  it("generates and returns the image when allowed", async () => {
    const res = await POST(post({ scene: "yoyo waves" }));
    expect(res.status).toBe(200);
    expect((await res.json()).image).toBe("data:image/jpeg;base64,AAAA");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("400s when scene is missing", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
});
