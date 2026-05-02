"use client";

/**
 * ContributorBadge — inline trust indicator for wiki page authors.
 *
 * Shows a handle with a small colored dot indicating trust level:
 *   - Green  (≥0.7)  — established contributor
 *   - Yellow (≥0.3)  — growing contributor
 *   - Gray   (<0.3)  — new / low-activity contributor
 *
 * The component is intentionally lightweight — a single <span> with
 * inline dot styling, no heavy dependencies.
 */

import { useEffect, useState } from "react";
import type { ContributorProfile } from "@/lib/types";

export interface ContributorBadgeProps {
  handle: string;
  /** Pre-supplied edit count (skips API fetch if both editCount and trustScore are provided). */
  editCount?: number;
  /** Pre-supplied trust score (skips API fetch if both editCount and trustScore are provided). */
  trustScore?: number;
}

/** Map trust score to a dot color. */
function trustColor(score: number): string {
  if (score >= 0.7) return "#22c55e"; // green-500
  if (score >= 0.3) return "#eab308"; // yellow-500
  return "#9ca3af"; // gray-400
}

export function ContributorBadge({
  handle,
  editCount: editCountProp,
  trustScore: trustScoreProp,
}: ContributorBadgeProps) {
  // If both props are supplied, skip the fetch entirely.
  const hasPreSupplied =
    editCountProp !== undefined && trustScoreProp !== undefined;

  const [profile, setProfile] = useState<ContributorProfile | null>(null);

  useEffect(() => {
    if (hasPreSupplied) return;

    let cancelled = false;

    fetch(`/api/contributors/${encodeURIComponent(handle)}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<ContributorProfile>;
      })
      .then((data) => {
        if (!cancelled && data) setProfile(data);
      })
      .catch(() => {
        // Silently fail — badge falls back to plain text appearance
      });

    return () => {
      cancelled = true;
    };
  }, [handle, hasPreSupplied]);

  const editCount = hasPreSupplied ? editCountProp : profile?.editCount;
  const trustScore = hasPreSupplied ? trustScoreProp : profile?.trustScore;

  const dotColor =
    trustScore !== undefined ? trustColor(trustScore) : "#9ca3af";
  const titleText =
    editCount !== undefined && trustScore !== undefined
      ? `${editCount} edit${editCount === 1 ? "" : "s"} · trust: ${trustScore.toFixed(2)}`
      : handle;

  return (
    <span
      className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"
      title={titleText}
    >
      <span
        data-testid="trust-dot"
        style={{
          display: "inline-block",
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {handle}
    </span>
  );
}
