"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * Auto-provisions the signed-in user's personal yoyo by pinging the idempotent
 * ensure endpoint once they're known to be signed in. No UI, no button — per
 * the design, every user gets a yoyo automatically. The server call is
 * idempotent, and a failure is silently retried on the next load.
 */
export function EnsureYoyo() {
  const { isLoaded, isSignedIn } = useUser();
  const fired = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || fired.current) return;
    fired.current = true;
    fetch("/api/agents/ensure", { method: "POST" }).catch(() => {
      // Best-effort — provisioning retries on the next page load.
    });
  }, [isLoaded, isSignedIn]);

  return null;
}
