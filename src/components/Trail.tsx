import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { commonsPath, profileHref } from "@/lib/links";
import { Mark, SrcChip } from "./folio/primitives";
import type { TrailEvent } from "@/lib/trail";

/**
 * The Trail — the lab's running ledger of recent ingests, edits, and
 * reconciliations (Folio design). A 2-column grid: a mono timestamp, then the
 * actor (human = accent, agent = graphite via {@link Mark}), the action, an
 * optional source-type chip, and the linked page title.
 */
export function Trail({ events }: { events: TrailEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {events.map((e, i) => (
        <li
          key={`${e.slug}-${e.action}-${e.ts}-${i}`}
          style={{
            display: "grid",
            gridTemplateColumns: "62px 1fr",
            gap: 16,
            alignItems: "baseline",
            padding: "13px 0",
            borderTop: "1px solid var(--rule)",
          }}
        >
          <time
            dateTime={e.when}
            className="receipt"
            style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap" }}
          >
            {formatRelativeTime(e.when)}
          </time>
          <div
            className="row"
            style={{ gap: 8, flexWrap: "wrap", fontSize: 14, lineHeight: 1.5 }}
          >
            <Mark
              id={e.actor}
              agent={e.isAgent}
              href={e.isAgent ? undefined : profileHref(e.actor)}
            />
            <span style={{ color: "var(--muted)" }}>{e.action}</span>
            {e.sourceType && <SrcChip type={e.sourceType} />}
            <Link
              href={commonsPath(e.slug)}
              style={{
                color: "var(--accent)",
                borderBottom: "1px solid var(--accent-soft)",
                textDecoration: "none",
              }}
            >
              {e.title}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
