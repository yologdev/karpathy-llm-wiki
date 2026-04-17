import { describe, it, expect } from "vitest";
import { getErrorMessage, isEnoent } from "../errors";

describe("getErrorMessage", () => {
  it("returns .message from an Error instance", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns .message from an Error subclass", () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "CustomError";
      }
    }
    expect(getErrorMessage(new CustomError("custom boom"))).toBe("custom boom");
  });

  it("returns the string directly when error is a string", () => {
    expect(getErrorMessage("something went wrong")).toBe(
      "something went wrong",
    );
  });

  it("returns default fallback for null", () => {
    expect(getErrorMessage(null)).toBe("An unexpected error occurred");
  });

  it("returns default fallback for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("An unexpected error occurred");
  });

  it("returns default fallback for a plain object", () => {
    expect(getErrorMessage({ code: 42 })).toBe("An unexpected error occurred");
  });

  it("returns default fallback for a number", () => {
    expect(getErrorMessage(404)).toBe("An unexpected error occurred");
  });

  it("uses custom fallback when provided", () => {
    expect(getErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("handles Error with empty message", () => {
    expect(getErrorMessage(new Error(""))).toBe("");
  });
});

describe("isEnoent", () => {
  it("returns true for an ENOENT error", () => {
    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    expect(isEnoent(err)).toBe(true);
  });

  it("returns false for a different error code", () => {
    const err = Object.assign(new Error("permission denied"), { code: "EACCES" });
    expect(isEnoent(err)).toBe(false);
  });

  it("returns false for a plain Error without code", () => {
    expect(isEnoent(new Error("boom"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isEnoent(null)).toBe(false);
    expect(isEnoent(undefined)).toBe(false);
    expect(isEnoent("ENOENT")).toBe(false);
    expect(isEnoent({ code: "ENOENT" })).toBe(false);
  });
});
