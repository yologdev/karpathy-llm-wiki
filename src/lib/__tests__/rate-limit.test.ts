import { describe, it, expect } from "vitest";
import { checkRateLimit, enforceRateLimit, type RateLimitStore } from "../rate-limit";

/** In-memory KV-ish store for the fixed-window logic. */
class FakeStore implements RateLimitStore {
  m = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.m.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.m.set(key, value);
  }
}

const RULE = { limit: 3, windowSec: 60 };

describe("checkRateLimit (fixed window)", () => {
  it("allows up to the limit, then blocks within the same window", async () => {
    const store = new FakeStore();
    const now = 1_000_000; // fixed → same window
    const r1 = await checkRateLimit(store, "k", RULE, now);
    const r2 = await checkRateLimit(store, "k", RULE, now);
    const r3 = await checkRateLimit(store, "k", RULE, now);
    const r4 = await checkRateLimit(store, "k", RULE, now);
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);
    expect(r1.remaining).toBe(2);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("resets in a new window", async () => {
    const store = new FakeStore();
    const t0 = 1_000_000;
    await checkRateLimit(store, "k", RULE, t0);
    await checkRateLimit(store, "k", RULE, t0);
    await checkRateLimit(store, "k", RULE, t0);
    expect((await checkRateLimit(store, "k", RULE, t0)).allowed).toBe(false);
    // Advance past the window → fresh counter.
    const t1 = t0 + RULE.windowSec * 1000;
    expect((await checkRateLimit(store, "k", RULE, t1)).allowed).toBe(true);
  });

  it("counts keys independently", async () => {
    const store = new FakeStore();
    const now = 2_000_000;
    await checkRateLimit(store, "a", RULE, now);
    await checkRateLimit(store, "a", RULE, now);
    await checkRateLimit(store, "a", RULE, now);
    expect((await checkRateLimit(store, "a", RULE, now)).allowed).toBe(false);
    // A different key has its own budget.
    expect((await checkRateLimit(store, "b", RULE, now)).allowed).toBe(true);
  });
});

describe("enforceRateLimit (fail-open)", () => {
  it("allows when there's no KV store (local/test/outage)", async () => {
    // No OpenNext Cloudflare context here → getStore() is null → fail-open.
    const r = await enforceRateLimit("mcp", "anykey");
    expect(r.allowed).toBe(true);
  });
});
