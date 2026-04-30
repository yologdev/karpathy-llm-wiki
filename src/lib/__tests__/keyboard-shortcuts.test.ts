import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isInputElement,
  matchShortcut,
  SHORTCUTS,
  SEQUENCE_TIMEOUT_MS,
} from "@/hooks/useKeyboardShortcuts";

// ---------------------------------------------------------------------------
// isInputElement
// ---------------------------------------------------------------------------

describe("isInputElement", () => {
  it("returns false for null target", () => {
    expect(isInputElement(null)).toBe(false);
  });

  it("returns false for non-element target", () => {
    expect(isInputElement({} as EventTarget)).toBe(false);
  });

  it("returns true for INPUT element", () => {
    const el = { tagName: "INPUT", isContentEditable: false } as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns true for TEXTAREA element", () => {
    const el = { tagName: "TEXTAREA", isContentEditable: false } as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns true for SELECT element", () => {
    const el = { tagName: "SELECT", isContentEditable: false } as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns true for contentEditable element", () => {
    const el = { tagName: "DIV", isContentEditable: true } as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns false for a regular DIV", () => {
    const el = { tagName: "DIV", isContentEditable: false } as HTMLElement;
    expect(isInputElement(el)).toBe(false);
  });

  it("returns false for BUTTON", () => {
    const el = { tagName: "BUTTON", isContentEditable: false } as HTMLElement;
    expect(isInputElement(el)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchShortcut
// ---------------------------------------------------------------------------

describe("matchShortcut", () => {
  it("matches single-key shortcut ?", () => {
    const { match, newBuffer } = matchShortcut([], "?");
    expect(match).not.toBeNull();
    expect(match!.keys).toEqual(["?"]);
    expect(match!.description).toContain("shortcuts");
    expect(newBuffer).toEqual([]);
  });

  it("buffers first key of two-key sequence", () => {
    const { match, newBuffer } = matchShortcut([], "g");
    expect(match).toBeNull();
    expect(newBuffer).toEqual(["g"]);
  });

  it("matches g then i → /ingest", () => {
    const { match, newBuffer } = matchShortcut(["g"], "i");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/ingest");
    expect(newBuffer).toEqual([]);
  });

  it("matches g then q → /query", () => {
    const { match } = matchShortcut(["g"], "q");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/query");
  });

  it("matches g then l → /lint", () => {
    const { match } = matchShortcut(["g"], "l");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/lint");
  });

  it("matches g then b → /wiki", () => {
    const { match } = matchShortcut(["g"], "b");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/wiki");
  });

  it("matches g then g → /wiki/graph", () => {
    const { match } = matchShortcut(["g"], "g");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/wiki/graph");
  });

  it("matches g then s → /settings", () => {
    const { match } = matchShortcut(["g"], "s");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/settings");
  });

  it("matches g then r → /raw", () => {
    const { match } = matchShortcut(["g"], "r");
    expect(match).not.toBeNull();
    expect(match!.route).toBe("/raw");
  });

  it("resets buffer on unrecognized second key", () => {
    const { match, newBuffer } = matchShortcut(["g"], "z");
    expect(match).toBeNull();
    expect(newBuffer).toEqual([]);
  });

  it("starts new sequence when invalid second key is itself a prefix", () => {
    // Press g, then x (not valid), buffer should reset.
    // Then pressing g again should start fresh.
    const r1 = matchShortcut(["g"], "x");
    expect(r1.match).toBeNull();
    expect(r1.newBuffer).toEqual([]);

    const r2 = matchShortcut(r1.newBuffer, "g");
    expect(r2.match).toBeNull();
    expect(r2.newBuffer).toEqual(["g"]);
  });

  it("handles ? after a pending g correctly", () => {
    // g is buffered, then ? should match as a single-key shortcut
    // since g+? is not a valid sequence
    const { match, newBuffer } = matchShortcut(["g"], "?");
    expect(match).not.toBeNull();
    expect(match!.keys).toEqual(["?"]);
    expect(newBuffer).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SHORTCUTS constant
// ---------------------------------------------------------------------------

describe("SHORTCUTS", () => {
  it("has expected number of shortcuts", () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(8);
  });

  it("all navigation shortcuts have a route", () => {
    const navShortcuts = SHORTCUTS.filter((s) => s.description.startsWith("Go to"));
    expect(navShortcuts.length).toBe(7);
    for (const s of navShortcuts) {
      expect(s.route).toBeTruthy();
    }
  });

  it("? shortcut does not have a route", () => {
    const helpShortcut = SHORTCUTS.find((s) => s.keys[0] === "?");
    expect(helpShortcut).toBeTruthy();
    expect(helpShortcut!.route).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sequence timeout
// ---------------------------------------------------------------------------

describe("sequence timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("SEQUENCE_TIMEOUT_MS is 1000ms", () => {
    expect(SEQUENCE_TIMEOUT_MS).toBe(1000);
  });

  it("simulates timeout resetting buffer conceptually", () => {
    // The timeout logic lives in the provider (clearing bufferRef after SEQUENCE_TIMEOUT_MS).
    // We test that the constant is correct and that matchShortcut with an empty
    // buffer after timeout correctly re-matches g as a prefix.
    const r1 = matchShortcut([], "g");
    expect(r1.newBuffer).toEqual(["g"]);

    // Simulate timeout by resetting buffer to []
    vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 1);

    // After timeout, buffer would be [], pressing i should not match g+i
    const r2 = matchShortcut([], "i");
    expect(r2.match).toBeNull();
    expect(r2.newBuffer).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Route mapping completeness
// ---------------------------------------------------------------------------

describe("route mapping", () => {
  const expectedRoutes: Record<string, string> = {
    "g i": "/ingest",
    "g q": "/query",
    "g l": "/lint",
    "g b": "/wiki",
    "g g": "/wiki/graph",
    "g s": "/settings",
    "g r": "/raw",
  };

  for (const [seq, route] of Object.entries(expectedRoutes)) {
    it(`${seq} → ${route}`, () => {
      const keys = seq.split(" ");
      let buffer: string[] = [];
      let match = null;
      for (const key of keys) {
        const result = matchShortcut(buffer, key);
        buffer = result.newBuffer;
        match = result.match;
      }
      expect(match).not.toBeNull();
      expect(match!.route).toBe(route);
    });
  }
});
