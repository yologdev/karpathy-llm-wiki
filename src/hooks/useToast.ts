"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  createElement,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, variant: ToastVariant) => void;
  removeToast: (id: number) => void;
}

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

/** Internal counter – exported only for testing. */
export let _nextId = 1;
export function _resetId() {
  _nextId = 1;
}

/**
 * Core toast state logic – pure function, exported for testing without React rendering.
 */
export function addToastToList(
  toasts: Toast[],
  message: string,
  variant: ToastVariant,
): { toasts: Toast[]; newToast: Toast } {
  const newToast: Toast = { id: _nextId++, message, variant };
  const next = [...toasts, newToast];
  // Evict oldest when exceeding max
  while (next.length > MAX_TOASTS) {
    next.shift();
  }
  return { toasts: next, newToast };
}

export function removeToastFromList(toasts: Toast[], id: number): Toast[] {
  return toasts.filter((t) => t.id !== id);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => removeToastFromList(prev, id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      setToasts((prev) => {
        const result = addToastToList(prev, message, variant);
        // Schedule auto-dismiss
        const timer = setTimeout(() => {
          removeToast(result.newToast.id);
        }, AUTO_DISMISS_MS);
        timersRef.current.set(result.newToast.id, timer);
        return result.toasts;
      });
    },
    [removeToast],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return createElement(
    ToastContext.Provider,
    { value: { toasts, addToast, removeToast } },
    children,
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
