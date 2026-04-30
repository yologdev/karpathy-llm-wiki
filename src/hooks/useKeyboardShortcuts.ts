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
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Pure utility functions (exported for testing)
// ---------------------------------------------------------------------------

const INPUT_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Returns true when the event target is an element where typing should be ignored. */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target as HTMLElement).tagName) return false;
  const el = target as HTMLElement;
  if (INPUT_TAG_NAMES.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return false;
}

/** Shortcut definition */
export interface ShortcutDef {
  /** Key sequence, e.g. ["g", "i"] or ["?"] */
  keys: string[];
  /** Human-readable description */
  description: string;
  /** Route to navigate to (if navigation shortcut) */
  route?: string;
}

/** Built-in shortcut definitions */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: ["g", "i"], description: "Go to Ingest", route: "/ingest" },
  { keys: ["g", "q"], description: "Go to Query", route: "/query" },
  { keys: ["g", "l"], description: "Go to Lint", route: "/lint" },
  { keys: ["g", "b"], description: "Go to Browse (Wiki)", route: "/wiki" },
  { keys: ["g", "g"], description: "Go to Graph", route: "/wiki/graph" },
  { keys: ["g", "s"], description: "Go to Settings", route: "/settings" },
  { keys: ["g", "r"], description: "Go to Raw sources", route: "/raw" },
  { keys: ["?"], description: "Toggle keyboard shortcuts help" },
];

/** Timeout in ms for multi-key sequences */
export const SEQUENCE_TIMEOUT_MS = 1000;

/**
 * Given the current key buffer and a new key, returns a matching shortcut
 * (if any) and the updated buffer.
 */
export function matchShortcut(
  buffer: string[],
  key: string,
): { match: ShortcutDef | null; newBuffer: string[] } {
  const candidate = [...buffer, key];

  // Check for exact match
  for (const shortcut of SHORTCUTS) {
    if (shortcut.keys.length !== candidate.length) continue;
    if (shortcut.keys.every((k, i) => k === candidate[i])) {
      return { match: shortcut, newBuffer: [] };
    }
  }

  // Check if candidate is a valid prefix of any shortcut
  const isPrefix = SHORTCUTS.some((shortcut) => {
    if (shortcut.keys.length <= candidate.length) return false;
    return candidate.every((k, i) => shortcut.keys[i] === k);
  });

  if (isPrefix) {
    return { match: null, newBuffer: candidate };
  }

  // Not a match or prefix — try treating this key as a fresh start
  // (e.g. user pressed "g" then "x" then "g" — the second "g" should start a new sequence)
  for (const shortcut of SHORTCUTS) {
    if (shortcut.keys.length === 1 && shortcut.keys[0] === key) {
      return { match: shortcut, newBuffer: [] };
    }
  }

  const isFreshPrefix = SHORTCUTS.some(
    (shortcut) => shortcut.keys.length > 1 && shortcut.keys[0] === key,
  );
  if (isFreshPrefix) {
    return { match: null, newBuffer: [key] };
  }

  return { match: null, newBuffer: [] };
}

// ---------------------------------------------------------------------------
// React context & provider
// ---------------------------------------------------------------------------

interface ShortcutsHelpContextValue {
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
}

const ShortcutsHelpContext = createContext<ShortcutsHelpContextValue | null>(
  null,
);

export function KeyboardShortcutsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const bufferRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in form elements
      if (isInputElement(e.target)) return;

      // Ignore when modifier keys are held (except shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // Skip pure modifier presses
      if (
        key === "Shift" ||
        key === "Control" ||
        key === "Alt" ||
        key === "Meta"
      ) {
        return;
      }

      const { match, newBuffer } = matchShortcut(bufferRef.current, key);

      bufferRef.current = newBuffer;

      // Reset the sequence timeout
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (newBuffer.length > 0) {
        timerRef.current = setTimeout(() => {
          bufferRef.current = [];
        }, SEQUENCE_TIMEOUT_MS);
      }

      if (match) {
        e.preventDefault();
        if (match.route) {
          router.push(match.route);
        } else if (match.keys.length === 1 && match.keys[0] === "?") {
          setShowHelp((prev) => !prev);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [router, clearBuffer]);

  return createElement(
    ShortcutsHelpContext.Provider,
    { value: { showHelp, setShowHelp } },
    children,
  );
}

export function useShortcutsHelp(): ShortcutsHelpContextValue {
  const ctx = useContext(ShortcutsHelpContext);
  if (!ctx) {
    throw new Error(
      "useShortcutsHelp must be used within a KeyboardShortcutsProvider",
    );
  }
  return ctx;
}
