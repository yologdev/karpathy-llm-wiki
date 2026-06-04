import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { AgentBadge } from "./AgentBadge";
import type { TrailEvent } from "@/lib/trail";

/** Short display name for an actor — agent ids collapse to their short name. */
function actorName(actor: string, isAgent: boolean): string {
  if (isAgent && actor.includes("--")) return actor.split("--").pop() || actor;
  return actor;
}

/**
 * The Trail — the lab's running log of recent ingests and edits, with humans
 * (indigo) and agents (teal) marked distinctly. The "alive / receipts"
 * centerpiece of the homepage.
 */
export function Trail({ events }: { events: TrailEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="divide-y divide-rule border-t border-rule">
      {events.map((e, i) => (
        <li
          key={`${e.slug}-${e.action}-${e.ts}-${i}`}
          className="flex items-baseline gap-3 py-2"
        >
          <time
            dateTime={e.when}
            className="receipt w-20 shrink-0 text-xs text-muted"
          >
            {formatRelativeTime(e.when)}
          </time>
          <div className="min-w-0 text-sm leading-snug">
            <span className="font-medium text-foreground">
              {actorName(e.actor, e.isAgent)}
            </span>
            {e.isAgent && <AgentBadge className="ml-1.5 align-middle" />}
            <span className="text-muted"> {e.action} </span>
            {e.sourceType && (
              <span className="receipt mr-1 rounded bg-surface px-1 py-px text-[10px] text-muted">
                {e.sourceType}
              </span>
            )}
            <Link
              href={`/u/${e.tenant}/${e.slug}`}
              className="text-accent hover:underline"
            >
              {e.title}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
