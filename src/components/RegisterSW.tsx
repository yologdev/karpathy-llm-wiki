"use client";

import { useEffect } from "react";

/**
 * Registers the minimal service worker (`/sw.js`) so yopedia is installable as a
 * PWA — the prerequisite for the Web Share Target. Pure progressive enhancement:
 * if registration fails (older browser, blocked SW), the site works unchanged and
 * we just log a warning. Mounted once in the root layout; renders nothing.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  }, []);
  return null;
}
