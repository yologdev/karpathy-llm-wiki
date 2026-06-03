"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * Auto-provisions the signed-in user's personal yoyo by pinging the idempotent
 * ensure endpoint once they're known to be signed in. No UI, no button — per
 * the design, every user gets a yoyo automatically. The server call is
 * idempotent; on failure (network error or non-OK response) the once-guard is
 * released so the next render/navigation retries rather than giving up for the
 * whole session.
 */
export function EnsureYoyo() {
  const { isLoaded, isSignedIn } = useUser();
  const fired = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || fired.current) return;
    fired.current = true;
    fetch("/api/agents/ensure", { method: "POST" })
      .then((res) => {
        // A non-OK response (e.g. a transient 500) doesn't reject fetch — so
        // check explicitly and allow a retry on the next effect run.
        if (!res.ok) fired.current = false;
      })
      .catch(() => {
        fired.current = false; // network blip — retry later
      });
  }, [isLoaded, isSignedIn]);

  return null;
}
