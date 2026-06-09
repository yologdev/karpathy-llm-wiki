import { listReadableWikiPages, readWikiPageWithFrontmatter, isAgentScopedType, ownerToTenant } from "./wiki";
import { listRevisions } from "./revisions";
import { parseSources } from "./sources";
import { isAgentHandle } from "./agents";
import type { SourceEntry } from "./types";
import type { Principal } from "./auth";

/** A single event in the public activity trail — the lab's running log. */
export interface TrailEvent {
  /** Sort key: epoch ms. */
  ts: number;
  /** ISO date string for display. */
  when: string;
  /** Who acted — a human handle, an agent id, or "system". */
  actor: string;
  /** True when the actor is an autonomous agent (e.g. `yoyo`). */
  isAgent: boolean;
  /** What happened. */
  action: "ingested" | "re-ingested" | "edited";
  /** For ingests, the kind of source. */
  sourceType?: SourceEntry["type"];
  slug: string;
  title: string;
  /** Canonical tenant for linking to `/u/<tenant>/<slug>`. */
  tenant: string;
}

// Bound the work: only scan the most-recently-updated public pages. The trail
// surfaces ~10-12 events and pages sort by `updated` (which every ingest/edit
// bumps), so the freshest 30 pages reliably over-fill the list — reading more
// is wasted I/O on the homepage path.
const MAX_PAGES_SCANNED = 30;

/**
 * The public activity trail. For anonymous reads (`principal == null` — the
 * homepage path) it serves the precomputed `_idx:recent` index in O(1), falling
 * back to {@link scanTrail} when the index isn't seeded yet. A signed-in caller
 * always scans, so its own private-page activity is included (the index is
 * built public-only — same anonymous-vs-scan split as the contributor index).
 */
export async function getTrail(
  limit = 12,
  principal: Principal | null = null,
): Promise<TrailEvent[]> {
  if (!principal) {
    const { getRecentIndex } = await import("./recent-index");
    const idx = await getRecentIndex();
    // The index stores each event's title as a SNAPSHOT from ingest time, so a
    // page re-ingested under a differently-cased concept ("Agentic systems" →
    // "agentic systems") shows up twice under two names. Resolve to the page's
    // CURRENT title so one page reads as one name. (scanTrail already uses the
    // live page title, so it needs no fixup.)
    if (idx !== null) return withCurrentTitles(idx.slice(0, limit), principal);
  }
  return scanTrail(limit, principal);
}

/** Overwrite each event's snapshot title with the page's current title. */
async function withCurrentTitles(
  events: TrailEvent[],
  principal: Principal | null,
): Promise<TrailEvent[]> {
  if (events.length === 0) return events;
  const titleBySlug = new Map(
    (await listReadableWikiPages(principal)).map((p) => [p.slug, p.title]),
  );
  return events.map((e) => {
    const current = titleBySlug.get(e.slug);
    return current && current !== e.title ? { ...e, title: current } : e;
  });
}

/**
 * Build the activity trail by merging recent ingests (from each page's
 * `sources[]` provenance) and edits (from revision metadata) into one
 * time-sorted feed. Agent-scoped pages are excluded; agent *actors* are kept
 * and flagged via {@link isAgentHandle} so the UI can mark them distinctly.
 *
 * This is the O(pages) scan — the fallback and the source for the `_idx:recent`
 * rebuild. {@link getTrail} serves the index for anonymous reads.
 */
export async function scanTrail(
  limit = 12,
  principal: Principal | null = null,
): Promise<TrailEvent[]> {
  const pages = (await listReadableWikiPages(principal))
    .filter((p) => !isAgentScopedType(p.type))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, MAX_PAGES_SCANNED);
  return trailEventsForPages(pages, limit);
}

/**
 * Build a time-sorted activity feed (ingests + edits) for a SPECIFIC set of
 * pages — the per-page scan shared by {@link scanTrail} (recent public pages)
 * and the user profile (a handle's own commons pages). Caps the page reads so a
 * large set can't blow up I/O; pass already-sorted/sliced pages for control.
 */
export async function trailEventsForPages(
  pages: { slug: string; title: string; owner?: string }[],
  limit = 12,
): Promise<TrailEvent[]> {
  // Gather each page's events concurrently — the per-page work is independent,
  // so this avoids serializing the (bounded) page-read + revision-list I/O.
  const perPage = await Promise.all(
    pages.slice(0, MAX_PAGES_SCANNED).map(async (page): Promise<TrailEvent[]> => {
      const evs: TrailEvent[] = [];

      // Ingests — structured provenance entries.
      try {
        const full = await readWikiPageWithFrontmatter(page.slug);
        const sources = parseSources(
          full?.frontmatter.sources as string | string[] | undefined,
        );
        for (const s of sources) {
          const ts = Date.parse(s.fetched);
          if (Number.isNaN(ts)) continue;
          const actor = s.triggered_by || "system";
          evs.push({
            ts,
            when: s.fetched,
            actor,
            isAgent: isAgentHandle(actor),
            action: "ingested",
            sourceType: s.type,
            slug: page.slug,
            title: page.title,
            tenant: ownerToTenant(page.owner),
          });
        }
      } catch {
        // Page unreadable — skip its ingests.
      }

      // Edits — attributed revisions.
      try {
        const revisions = await listRevisions(page.slug);
        for (const r of revisions) {
          if (!r.author) continue;
          evs.push({
            ts: r.timestamp,
            when: r.date,
            actor: r.author,
            isAgent: isAgentHandle(r.author),
            action: "edited",
            slug: page.slug,
            title: page.title,
            tenant: ownerToTenant(page.owner),
          });
        }
      } catch {
        // No revisions — skip.
      }

      return evs;
    }),
  );

  const events = perPage.flat();
  events.sort((a, b) => b.ts - a.ts);

  // Collapse near-duplicate events (same actor+action+page within ~2 min).
  const deduped: TrailEvent[] = [];
  for (const e of events) {
    const dup = deduped.find(
      (d) =>
        d.slug === e.slug &&
        d.actor === e.actor &&
        d.action === e.action &&
        Math.abs(d.ts - e.ts) < 120_000,
    );
    if (!dup) deduped.push(e);
  }

  return deduped.slice(0, limit);
}
