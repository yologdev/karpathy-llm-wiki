import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    // Later items resolve first (descending delay) — a naive push-on-resolve
    // would scramble the output; the result must still match input order.
    const items = [0, 1, 2, 3, 4];
    const out = await mapWithConcurrency(items, 8, async (n) => {
      await new Promise((r) => setTimeout(r, (items.length - n) * 5));
      return n * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
  });

  it("passes the index to the mapper", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 2, async (item, i) => `${i}:${item}`);
    expect(out).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // sanity: it actually parallelized
  });

  it("runs every item even when there are fewer than the limit", async () => {
    const out = await mapWithConcurrency([1, 2], 10, async (n) => n + 1);
    expect(out).toEqual([2, 3]);
  });

  it("returns an empty array for empty input without spawning workers", async () => {
    const out = await mapWithConcurrency([], 4, async () => {
      throw new Error("should not be called");
    });
    expect(out).toEqual([]);
  });

  it("rejects the whole call when any fn rejects (documented contract)", async () => {
    // Callers (search, context) rely on a failed read surfacing as an error
    // rather than being swallowed. Lock that in so a future "skip-on-failure"
    // refactor can't silently change the contract.
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
