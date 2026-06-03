import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  getStorage: vi.fn(() => ({ readAsset: vi.fn() })),
}));
// rawRelPath maps a markdown ref to the physical storage key (raw/ prefix).
vi.mock("@/lib/wiki", () => ({
  rawRelPath: (f: string) => `raw/${f}`,
}));

import { getStorage } from "@/lib/storage";
import { GET } from "@/app/api/assets/[...path]/route";

const mockedGetStorage = vi.mocked(getStorage);

function readAssetReturning(buf: ArrayBuffer | Error) {
  const readAsset = vi.fn(() =>
    buf instanceof Error ? Promise.reject(buf) : Promise.resolve(buf),
  );
  mockedGetStorage.mockReturnValue({ readAsset } as never);
  return readAsset;
}

function req() {
  return new Request("http://localhost/api/assets/x");
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/assets/[...path]", () => {
  it("serves an asset, mapping assets/<...> → raw/assets/<...> with the right Content-Type", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const readAsset = readAssetReturning(bytes);

    const res = await GET(req(), {
      params: Promise.resolve({ path: ["alice", "diagram.png"] }),
    });

    expect(res.status).toBe(200);
    expect(readAsset).toHaveBeenCalledWith("raw/assets/alice/diagram.png");
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("404s on a genuinely missing asset (ENOENT)", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    readAssetReturning(enoent);
    const res = await GET(req(), {
      params: Promise.resolve({ path: ["alice", "missing.png"] }),
    });
    expect(res.status).toBe(404);
  });

  it("500s on a real storage failure (not ENOENT) so an outage isn't masked as 404", async () => {
    readAssetReturning(new Error("R2 service unavailable"));
    const res = await GET(req(), {
      params: Promise.resolve({ path: ["alice", "x.png"] }),
    });
    expect(res.status).toBe(500);
  });

  it.each([["..", "x.png"], ["alice", ".."], ["alice", "a/b.png"], ["", "x.png"]])(
    "404s and never reads storage on a traversal/unsafe segment: %j",
    async (...path) => {
      const readAsset = readAssetReturning(new Uint8Array().buffer);
      const res = await GET(req(), { params: Promise.resolve({ path }) });
      expect(res.status).toBe(404);
      expect(readAsset).not.toHaveBeenCalled();
    },
  );

  it("adds a sandbox CSP for SVGs (same-origin script neutralization)", async () => {
    readAssetReturning(new Uint8Array([60]).buffer);
    const res = await GET(req(), {
      params: Promise.resolve({ path: ["alice", "logo.svg"] }),
    });
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });

  it("falls back to application/octet-stream for an unknown extension", async () => {
    readAssetReturning(new Uint8Array([0]).buffer);
    const res = await GET(req(), {
      params: Promise.resolve({ path: ["alice", "file.bin"] }),
    });
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
