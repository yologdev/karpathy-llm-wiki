"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

/**
 * Folio theme toggle — a round ghost button that flips dark/light (sun shown in
 * dark, moon in light), from `design/ui.jsx`. Reuses the codebase's theme
 * mechanism: `localStorage["theme"]` + `.dark`/`.light` on `<html>` (the boot
 * script in `layout.tsx` reads the same key), so it stays consistent.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function flip() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.classList.toggle("light", !next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private mode — fine */
    }
  }

  // Placeholder before mount to avoid an icon flash / layout shift.
  if (!mounted) {
    return (
      <span
        className="btn ghost"
        style={{ width: 36, height: 36, padding: 8, borderRadius: "50%" }}
        aria-hidden
      />
    );
  }

  return (
    <button
      onClick={flip}
      className="btn ghost"
      aria-label="Toggle theme"
      title={dark ? "Switch to light" : "Switch to dark"}
      style={{ padding: 8, borderRadius: "50%", width: 36, height: 36 }}
    >
      {dark ? <Icon.sun width="17" height="17" /> : <Icon.moon width="17" height="17" />}
    </button>
  );
}
