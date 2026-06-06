"use client";

import Link from "next/link";

import { commonsPath, pagePath, ownerToTenant } from "@/lib/links";
import type { DataviewResultRow } from "./DataviewFilterRow";

/**
 * Resolve a dataview result row to its canonical URL. PUBLIC commons pages live
 * at the global `/wiki/<slug>`; private/agent pages (which a principal-scoped
 * query can surface for the owner) have no global URL and stay owner-scoped.
 */
function rowHref(row: DataviewResultRow): string {
  const fm = row.frontmatter;
  const visibility = typeof fm.visibility === "string" ? fm.visibility : undefined;
  const type = typeof fm.type === "string" ? fm.type : undefined;
  if (visibility !== "private" && !type?.startsWith("agent-")) {
    return commonsPath(row.slug);
  }
  const owner = typeof fm.owner === "string" ? fm.owner : undefined;
  return pagePath(ownerToTenant(owner), row.slug);
}

// ---------------------------------------------------------------------------
// DataviewResultsTable component
// ---------------------------------------------------------------------------

interface DataviewResultsTableProps {
  results: DataviewResultRow[];
  total: number;
}

export function DataviewResultsTable({
  results,
  total,
}: DataviewResultsTableProps) {
  // Collect the unique frontmatter keys from the result set for table headers
  const fmKeys =
    results.length > 0
      ? Array.from(
          results.reduce<Set<string>>((set, r) => {
            for (const k of Object.keys(r.frontmatter)) set.add(k);
            return set;
          }, new Set()),
        ).sort()
      : [];

  return (
    <div>
      <p className="mb-2 text-xs text-foreground/50">
        {total} {total === 1 ? "result" : "results"}
      </p>
      {results.length === 0 ? (
        <p className="text-sm text-foreground/60">
          No pages matched the query.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-xs text-foreground/50">
                <th className="py-1.5 pr-3 font-medium">Slug</th>
                <th className="py-1.5 pr-3 font-medium">Title</th>
                {fmKeys.map((k) => (
                  <th key={k} className="py-1.5 pr-3 font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr
                  key={row.slug}
                  className="border-b border-foreground/5 last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    <Link
                      href={rowHref(row)}
                      className="text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                    >
                      {row.slug}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3">{row.title}</td>
                  {fmKeys.map((k) => {
                    const val = row.frontmatter[k];
                    const display =
                      val === undefined
                        ? ""
                        : Array.isArray(val)
                          ? val.join(", ")
                          : val;
                    return (
                      <td key={k} className="py-1.5 pr-3 text-foreground/70">
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
