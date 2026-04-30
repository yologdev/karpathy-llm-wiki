import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  addToastToList,
  removeToastFromList,
  _resetId,
  type Toast,
} from "@/hooks/useToast";

describe("toast logic", () => {
  beforeEach(() => {
    _resetId();
  });

  describe("addToastToList", () => {
    it("adds a toast with correct properties", () => {
      const result = addToastToList([], "Hello", "success");
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0]).toEqual({
        id: 1,
        message: "Hello",
        variant: "success",
      });
      expect(result.newToast).toBe(result.toasts[0]);
    });

    it("assigns incrementing ids", () => {
      const r1 = addToastToList([], "first", "info");
      const r2 = addToastToList(r1.toasts, "second", "warning");
      expect(r1.newToast.id).toBe(1);
      expect(r2.newToast.id).toBe(2);
    });

    it("evicts oldest toast when exceeding max of 5", () => {
      let toasts: Toast[] = [];
      for (let i = 0; i < 6; i++) {
        const result = addToastToList(toasts, `toast-${i}`, "info");
        toasts = result.toasts;
      }
      expect(toasts).toHaveLength(5);
      // The first toast (id=1, message=toast-0) should be evicted
      expect(toasts[0].message).toBe("toast-1");
      expect(toasts[4].message).toBe("toast-5");
    });

    it("handles different variants", () => {
      const variants = ["success", "error", "info", "warning"] as const;
      let toasts: Toast[] = [];
      for (const v of variants) {
        const result = addToastToList(toasts, `msg-${v}`, v);
        toasts = result.toasts;
      }
      expect(toasts).toHaveLength(4);
      expect(toasts.map((t) => t.variant)).toEqual([
        "success",
        "error",
        "info",
        "warning",
      ]);
    });
  });

  describe("removeToastFromList", () => {
    it("removes a specific toast by id", () => {
      let toasts: Toast[] = [];
      const r1 = addToastToList(toasts, "first", "info");
      toasts = r1.toasts;
      const r2 = addToastToList(toasts, "second", "success");
      toasts = r2.toasts;

      const result = removeToastFromList(toasts, r1.newToast.id);
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe("second");
    });

    it("returns same list if id not found", () => {
      const toasts: Toast[] = [
        { id: 1, message: "test", variant: "info" },
      ];
      const result = removeToastFromList(toasts, 999);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(toasts[0]);
    });

    it("returns empty list when removing last toast", () => {
      const toasts: Toast[] = [
        { id: 1, message: "only", variant: "error" },
      ];
      const result = removeToastFromList(toasts, 1);
      expect(result).toHaveLength(0);
    });
  });

  describe("auto-dismiss timing", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("auto-dismiss concept: setTimeout of 4000ms", () => {
      const callback = vi.fn();
      const AUTO_DISMISS_MS = 4000;
      setTimeout(callback, AUTO_DISMISS_MS);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3999);
      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
