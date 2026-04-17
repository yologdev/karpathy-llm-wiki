import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime, parseISODate } from "../format";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function freeze(offsetMs: number): string {
    // Returns an ISO string that is `offsetMs` in the past relative to the
    // faked "now".
    const now = 1_700_000_000_000; // fixed reference
    vi.spyOn(Date, "now").mockReturnValue(now);
    return new Date(now - offsetMs).toISOString();
  }

  it('returns "just now" for timestamps less than 45 seconds ago', () => {
    const iso = freeze(10_000); // 10 s ago
    expect(formatRelativeTime(iso)).toBe("just now");
  });

  it('returns "just now" for future timestamps', () => {
    const iso = freeze(-5_000); // 5 s in the future
    expect(formatRelativeTime(iso)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const iso = freeze(5 * 60 * 1000); // 5 min ago
    expect(formatRelativeTime(iso)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const iso = freeze(3 * 60 * 60 * 1000); // 3 hr ago
    expect(formatRelativeTime(iso)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const iso = freeze(2 * 24 * 60 * 60 * 1000); // 2 days ago
    expect(formatRelativeTime(iso)).toBe("2d ago");
  });

  it("returns weeks ago", () => {
    const iso = freeze(14 * 24 * 60 * 60 * 1000); // 14 days = 2 weeks
    expect(formatRelativeTime(iso)).toBe("2w ago");
  });

  it("returns months ago", () => {
    const iso = freeze(90 * 24 * 60 * 60 * 1000); // ~3 months
    expect(formatRelativeTime(iso)).toBe("3mo ago");
  });

  it("returns years ago", () => {
    const iso = freeze(400 * 24 * 60 * 60 * 1000); // ~1.1 years
    expect(formatRelativeTime(iso)).toBe("1y ago");
  });

  it("returns YYYY-MM-DD slice for unparseable input", () => {
    expect(formatRelativeTime("not-a-date")).toBe("not-a-date");
  });

  it("returns first 10 chars for garbage strings", () => {
    expect(formatRelativeTime("hello world foo")).toBe("hello worl");
  });
});

describe("parseISODate", () => {
  it("extracts YYYY-MM-DD from a full ISO timestamp", () => {
    expect(parseISODate("2024-06-15T10:30:00.000Z")).toBe("2024-06-15");
  });

  it("returns YYYY-MM-DD strings as-is", () => {
    expect(parseISODate("2024-01-01")).toBe("2024-01-01");
  });

  it("handles ISO timestamps without milliseconds", () => {
    expect(parseISODate("2023-12-25T08:00:00Z")).toBe("2023-12-25");
  });

  it("returns null for null input", () => {
    expect(parseISODate(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseISODate(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseISODate("")).toBeNull();
  });

  it("returns null for unparseable string", () => {
    expect(parseISODate("not-a-date")).toBeNull();
  });

  it("handles date with timezone offset", () => {
    expect(parseISODate("2024-03-10T12:00:00+05:00")).toBe("2024-03-10");
  });
});
