"use client";

import { useEffect, useState } from "react";
import { pagePath } from "@/lib/links";

type SlugTenants = Record<string, string>;

// Session-level cache so the slug→tenant map is fetched at most once across all
// components that use it (search, query sources, lint, batch, ingest).
let cache: SlugTenants | null = null;
let inflight: Promise<SlugTenants> | null = null;

function load(): Promise<SlugTenants> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/wiki/routes")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: SlugTenants) => {
        cache = m;
        return m;
      })
      .catch(() => ({}) as SlugTenants)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Resolve a target slug to its canonical `/u/<tenant>/<slug>` href on the
 * client. Falls back to the legacy `/wiki/<slug>` (which 308-redirects to
 * canonical) while the map is loading or for an unknown slug — so links always
 * work, just with one redirect hop in the fallback case.
 */
export function useSlugTenants() {
  const [map, setMap] = useState<SlugTenants>(cache ?? {});
  useEffect(() => {
    let on = true;
    load().then((m) => {
      if (on) setMap(m);
    });
    return () => {
      on = false;
    };
  }, []);
  const hrefForSlug = (slug: string): string =>
    map[slug] ? pagePath(map[slug], slug) : `/wiki/${slug}`;
  return { hrefForSlug };
}
