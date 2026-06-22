"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PostHog } from "posthog-js";
import { logger } from "@/lib/logger";

// PostHog project API key is a PUBLIC client key (`phc_…`) — it ships in the
// browser regardless, so embedding it is fine (no secret-rotation concern).
// Env overrides the default; setting NEXT_PUBLIC_POSTHOG_KEY="" explicitly
// DISABLES analytics (?? keeps "", which the guard below treats as off), while
// leaving it unset keeps tracking on with the built-in key.
const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ??
  "phc_l1jtx4tZRSCf0wcwuvPgC6fXGpyvOxus4bsqOS4BOI2";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

// Lazy-load + init posthog-js once (only when a key is configured), so it stays
// out of the initial chunk and is a no-op when analytics is disabled. The cached
// promise ALWAYS resolves (to the client or null) — never rejects — so callers
// can't trip an unhandled rejection, and a transient chunk-load failure nulls the
// cache so the next navigation retries instead of being dead for the session.
let phPromise: Promise<PostHog | null> | null = null;
function getPostHog(): Promise<PostHog | null> {
  if (!POSTHOG_KEY) return Promise.resolve(null);
  if (!phPromise) {
    phPromise = import("posthog-js")
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          persistence: "memory", // cookieless → no consent banner required
          autocapture: false, // pageviews only — no click/interaction capture
          capture_pageview: false, // fired manually on route change (App Router)
          capture_pageleave: false,
          disable_session_recording: true, // no session replay
          person_profiles: "identified_only",
        });
        return posthog;
      })
      .catch((err) => {
        // Non-critical: the page works without analytics. Evict so a transient
        // failure can recover next nav, and log (per HtmlPreview/RegisterSW
        // convention) rather than leaving an invisible unhandled rejection.
        phPromise = null;
        logger.warn("analytics", "posthog load/init failed; skipping", err);
        return null;
      });
  }
  return phPromise;
}

/**
 * Page-view analytics (PostHog). App Router client navigation does NOT fire
 * pageviews, so we capture `$pageview` on every pathname/searchParams change
 * (plus the initial mount). Cookieless (memory persistence) so no consent banner
 * is needed; pageviews only — no autocapture, no session replay. Renders nothing.
 *
 * Must be mounted inside a <Suspense> boundary (useSearchParams requirement).
 */
export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    void getPostHog()
      .then((ph) => ph?.capture("$pageview", { $current_url: url }))
      .catch((err) => logger.warn("analytics", "pageview capture failed", err));
  }, [pathname, searchParams]);

  return null;
}
