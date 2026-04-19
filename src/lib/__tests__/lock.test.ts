import { describe, it, expect, beforeEach } from "vitest";
import { withFileLock, _resetLocks } from "../lock";

// ---------------------------------------------------------------------------
// Reset locks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetLocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a promise that resolves after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Basic execution
// ---------------------------------------------------------------------------

describe("withFileLock", () => {
  it("runs the function and returns its value", async () => {
    const result = await withFileLock("key1", async () => 42);
    expect(result).toBe(42);
  });

  it("returns complex values", async () => {
    const result = await withFileLock("key1", async () => ({
      name: "test",
      items: [1, 2, 3],
    }));
    expect(result).toEqual({ name: "test", items: [1, 2, 3] });
  });

  it("supports void functions", async () => {
    let called = false;
    await withFileLock("key1", async () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Serialization — same key
  // -------------------------------------------------------------------------

  it("serializes calls with the same key", async () => {
    const order: number[] = [];

    const p1 = withFileLock("shared", async () => {
      order.push(1);
      await sleep(50);
      order.push(2);
    });

    const p2 = withFileLock("shared", async () => {
      order.push(3);
      await sleep(10);
      order.push(4);
    });

    await Promise.all([p1, p2]);
    // p1 must complete (1,2) before p2 starts (3,4)
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("serializes three calls with the same key", async () => {
    const order: string[] = [];

    const p1 = withFileLock("k", async () => {
      order.push("a-start");
      await sleep(30);
      order.push("a-end");
    });
    const p2 = withFileLock("k", async () => {
      order.push("b-start");
      await sleep(20);
      order.push("b-end");
    });
    const p3 = withFileLock("k", async () => {
      order.push("c-start");
      await sleep(10);
      order.push("c-end");
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([
      "a-start",
      "a-end",
      "b-start",
      "b-end",
      "c-start",
      "c-end",
    ]);
  });

  // -------------------------------------------------------------------------
  // Different keys don't block each other
  // -------------------------------------------------------------------------

  it("runs calls with different keys concurrently", async () => {
    const order: string[] = [];

    const p1 = withFileLock("key-a", async () => {
      order.push("a-start");
      await sleep(50);
      order.push("a-end");
    });

    const p2 = withFileLock("key-b", async () => {
      order.push("b-start");
      await sleep(10);
      order.push("b-end");
    });

    await Promise.all([p1, p2]);
    // Both should start before either finishes
    // b-start should happen before a-end since they run concurrently
    // and b takes much less time
    expect(order[0]).toBe("a-start");
    expect(order[1]).toBe("b-start");
    // b finishes first because it sleeps less
    expect(order[2]).toBe("b-end");
    expect(order[3]).toBe("a-end");
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it("re-throws when fn throws", async () => {
    await expect(
      withFileLock("err-key", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("re-throws non-Error thrown values", async () => {
    await expect(
      withFileLock("err-key", async () => {
        throw "string-error";
      }),
    ).rejects.toBe("string-error");
  });

  // -------------------------------------------------------------------------
  // Error doesn't block the next call
  // -------------------------------------------------------------------------

  it("after fn throws, next call for same key still runs", async () => {
    // First call: will throw
    await expect(
      withFileLock("recover", async () => {
        throw new Error("first fails");
      }),
    ).rejects.toThrow("first fails");

    // Second call: should succeed
    const result = await withFileLock("recover", async () => "recovered");
    expect(result).toBe("recovered");
  });

  it("error in middle of chain doesn't block subsequent calls", async () => {
    const order: string[] = [];

    const p1 = withFileLock("chain", async () => {
      order.push("first");
      return "ok";
    });

    const p2 = withFileLock("chain", async () => {
      order.push("second-throws");
      throw new Error("oops");
    });

    const p3 = withFileLock("chain", async () => {
      order.push("third");
      return "done";
    });

    await p1;
    await expect(p2).rejects.toThrow("oops");
    const result = await p3;

    expect(result).toBe("done");
    expect(order).toEqual(["first", "second-throws", "third"]);
  });
});

// ---------------------------------------------------------------------------
// _resetLocks
// ---------------------------------------------------------------------------

describe("_resetLocks", () => {
  it("clears the lock map for a fresh start", async () => {
    // Set up a long-running lock and verify reset allows new calls through
    const order: string[] = [];

    // Start a chain: first call takes 100ms
    const p1 = withFileLock("reset-test", async () => {
      await sleep(100);
      order.push("slow");
    });

    // Reset while p1 is in flight
    _resetLocks();

    // New call should NOT wait for p1 because the chain was cleared
    const p2 = withFileLock("reset-test", async () => {
      order.push("after-reset");
    });

    await Promise.all([p1, p2]);

    // "after-reset" should appear before "slow" since it was unchained
    const resetIdx = order.indexOf("after-reset");
    const slowIdx = order.indexOf("slow");
    expect(resetIdx).toBeLessThan(slowIdx);
  });

  it("can be called multiple times safely", () => {
    _resetLocks();
    _resetLocks();
    _resetLocks();
    // No error thrown
  });

  it("allows fresh serialization after reset", async () => {
    const order: number[] = [];

    await withFileLock("fresh", async () => {
      order.push(1);
    });

    _resetLocks();

    const p1 = withFileLock("fresh", async () => {
      order.push(2);
      await sleep(30);
      order.push(3);
    });
    const p2 = withFileLock("fresh", async () => {
      order.push(4);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2, 3, 4]);
  });
});
