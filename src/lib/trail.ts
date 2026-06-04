import { listReadableWikiPages, readWikiPageWithFrontmatter, isAgentScopedType } from "./wiki";
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
  action: "ingested" | "edited";
  /** For ingests, the kind of source. */
  sourceType?: SourceEntry["type"];
  slug: string;
  title: string;
}

// Bound the work: only scan the most-recently-updated public pages.
const MAX_PAGES_SCANNED = 60;

/**
 * Build the activity trail by merging recent ingests (from each page's
 * `sources[]` provenance) and edits (from revision metadata) into one
 * time-sorted feed. Agent-scoped pages are excluded; agent *actors* are kept
 * and flagged via {@link isAgentHandle} so the UI can mark them distinctly.
 */
export async function getTrail(
  limit = 12,
  principal: Principal | null = null,
): Promise<TrailEvent[]> {
  const pages = (await listReadableWikiPages(principal))
    .filter((p) => !isAgentScopedType(p.type))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, MAX_PAGES_SCANNED);

  // Gather each page's events concurrently — the per-page work is independent,
  // so this avoids serializing the (bounded) page-read + revision-list I/O.
  const perPage = await Promise.all(
    pages.map(async (page): Promise<TrailEvent[]> => {
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
