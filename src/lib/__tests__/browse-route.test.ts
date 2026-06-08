import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the browse library — we only test the route's param parsing + wiring.
vi.mock("@/lib/browse", async () => {
  const actual = await vi.importActual<typeof import("../browse")>("../browse");
  return {
    ...actual, // keep the real BROWSE_PAGE_SIZE constant + types
    searchCommons: vi.fn(async () => ({
      results: [],
      total: 0,
      discussionStats: {},
      tags: [],
    })),
  };
});

vi.mock("@/lib/auth", () => ({
  getPrincipal: vi.fn(async () => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { searchCommons, BROWSE_PAGE_SIZE } from "../browse";
import { logger } from "../logger";
import { GET } from "@/app/api/wiki/browse/route";

const mockedSearch = vi.mocked(searchCommons);

function call(query: string) {
  return GET(new Request(`http://localhost/api/wiki/browse${query}`));
}

/** Return the options object the route passed to searchCommons. */
function lastOpts() {
  return mockedSearch.mock.calls[mockedSearch.mock.calls.length - 1][1]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSearch.mockResolvedValue({
    results: [],
    total: 0,
    discussionStats: {},
    tags: [],
  });
});

describe("GET /api/wiki/browse — param parsing", () => {
  it("passes the query and defaults scope/sort/page", async () => {
    await call("?q=transformers");
    expect(mockedSearch).toHaveBeenCalledWith("transformers", expect.anything());
    const opts = lastOpts();
    expect(opts.scope).toBe("all");
    expect(opts.sort).toBe("recent");
    expect(opts.page).toBe(1);
    expect(opts.pageSize).toBe(BROWSE_PAGE_SIZE);
  });

  it("falls back to 'recent' for an unknown sort, passes valid ones through", async () => {
    await call("?sort=garbage");
    expect(lastOpts().sort).toBe("recent");
    await call("?sort=confidence");
    expect(lastOpts().sort).toBe("confidence");
    await call("?sort=sources");
    expect(lastOpts().sort).toBe("sources");
  });

  it("parses + clamps page (NaN→1, negative→1)", async () => {
    await call("?page=abc");
    expect(lastOpts().page).toBe(1);
    await call("?page=-5");
    expect(lastOpts().page).toBe(1);
    await call("?page=3");
    expect(lastOpts().page).toBe(3);
  });

  it("parses + clamps pageSize (over-max→100, missing→default)", async () => {
    await call("?pageSize=9999");
    expect(lastOpts().pageSize).toBe(100);
    await call("?pageSize=10");
    expect(lastOpts().pageSize).toBe(10);
    await call("");
    expect(lastOpts().pageSize).toBe(BROWSE_PAGE_SIZE);
  });

  it("forwards scope and tag", async () => {
    await call("?scope=vault:v1&tag=ml");
    const opts = lastOpts();
    expect(opts.scope).toBe("vault:v1");
    expect(opts.tag).toBe("ml");
  });

  it("echoes page + pageSize back in the payload", async () => {
    const res = await call("?page=2&pageSize=5");
    const body = await res.json();
    expect(body).toMatchObject({ page: 2, pageSize: 5, total: 0, results: [] });
  });
});

describe("GET /api/wiki/browse — error path", () => {
  it("logs with request context and returns 500 when searchCommons throws", async () => {
    mockedSearch.mockRejectedValue(new Error("KV down"));
    const res = await call("?q=boom&scope=all&page=1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Browse search failed" });
    expect(logger.error).toHaveBeenCalled();
    const msg = vi.mocked(logger.error).mock.calls[0].join(" ");
    expect(msg).toContain("boom"); // the query is in the logged context
  });
});
