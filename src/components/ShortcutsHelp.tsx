"use client";

import { useEffect, useCallback } from "react";
import { useShortcutsHelp, SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

/** Detect platform for modifier key display */
function modKey(): string {
  if (typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? "")) {
    return "⌘";
  }
  return "Ctrl";
}

export function ShortcutsHelp() {
  const { showHelp, setShowHelp } = useShortcutsHelp();

  const close = useCallback(() => setShowHelp(false), [setShowHelp]);

  useEffect(() => {
    if (!showHelp) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showHelp, close]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div className="w-full max-w-md mx-4 rounded-lg border border-foreground/10 bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-foreground/50 hover:text-foreground transition-colors p-1 rounded-md hover:bg-foreground/5"
            aria-label="Close shortcuts help"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-foreground/50">
                <th className="pb-2 pr-4 font-medium">Shortcut</th>
                <th className="pb-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              {/* Built-in navigation shortcuts */}
              {SHORTCUTS.map((shortcut) => (
                <tr
                  key={shortcut.keys.join("-")}
                  className="border-t border-foreground/5"
                >
                  <td className="py-1.5 pr-4">
                    <kbd className="inline-flex gap-1">
                      {shortcut.keys.map((k, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="text-foreground/30 mx-0.5">
                              {" "}
                            </span>
                          )}
                          <span className="rounded border border-foreground/20 bg-foreground/5 px-1.5 py-0.5 font-mono text-xs">
                            {k}
                          </span>
                        </span>
                      ))}
                    </kbd>
                  </td>
                  <td className="py-1.5">{shortcut.description}</td>
                </tr>
              ))}
              {/* Existing search shortcut */}
              <tr className="border-t border-foreground/5">
                <td className="py-1.5 pr-4">
                  <kbd className="inline-flex gap-1">
                    <span className="rounded border border-foreground/20 bg-foreground/5 px-1.5 py-0.5 font-mono text-xs">
                      {modKey()}+K
                    </span>
                  </kbd>
                </td>
                <td className="py-1.5">Focus search</td>
              </tr>
              <tr className="border-t border-foreground/5">
                <td className="py-1.5 pr-4">
                  <kbd className="inline-flex gap-1">
                    <span className="rounded border border-foreground/20 bg-foreground/5 px-1.5 py-0.5 font-mono text-xs">
                      /
                    </span>
                  </kbd>
                </td>
                <td className="py-1.5">Focus search</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border-t border-foreground/10 px-4 py-2 text-xs text-foreground/40">
          Press <kbd className="rounded border border-foreground/20 bg-foreground/5 px-1 py-0.5 font-mono text-xs">Esc</kbd> or <kbd className="rounded border border-foreground/20 bg-foreground/5 px-1 py-0.5 font-mono text-xs">?</kbd> to close
        </div>
      </div>
    </div>
  );
}
