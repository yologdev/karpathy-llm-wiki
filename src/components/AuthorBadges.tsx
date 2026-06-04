"use client";

/**
 * AuthorBadges — client-side wrapper that renders ContributorBadge
 * components for a wiki page's authors list. Used in the server-rendered
 * PageMetadata to add trust dots without converting the whole page to
 * a client component.
 *
 * Batch-fetches contributor profiles for all authors in a single API call,
 * then passes `editCount` and `trustScore` as pre-supply props to each
 * `ContributorBadge`, avoiding the N+1 per-badge fetch problem.
 */

import { useEffect, useState } from "react";
import { ContributorBadge } from "./ContributorBadge";
import type { ContributorProfile } from "@/lib/types";

interface AuthorBadgesProps {
  authors: string[];
  contributors: string[];
}

export function AuthorBadges({ authors, contributors }: AuthorBadgesProps) {
  const [profiles, setProfiles] = useState<Map<string, ContributorProfile>>(
    new Map(),
  );

  useEffect(() => {
    if (authors.length === 0) return;

    let cancelled = false;

    const handles = authors.map(encodeURIComponent).join(",");
    fetch(`/api/contributors?handles=${handles}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ contributors: ContributorProfile[] }>;
      })
      .then((data) => {
        if (cancelled || !data) return;
        const map = new Map<string, ContributorProfile>();
        for (const p of data.contributors) {
          map.set(p.handle, p);
        }
        setProfiles(map);
      })
      .catch(() => {
        // Silently fail — badges fall back to plain appearance
      });

    return () => {
      cancelled = true;
    };
  }, [authors]);

  if (authors.length === 0) return null;

  return (
    <div className="text-sm text-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>By</span>
      {authors.map((author, i) => {
        const profile = profiles.get(author);
        return (
          <span key={author} className="inline-flex items-center">
            <ContributorBadge
              handle={author}
              editCount={profile?.editCount}
              trustScore={profile?.trustScore}
            />
            {i < authors.length - 1 && <span className="ml-1">,</span>}
          </span>
        );
      })}
      {contributors.length > 0 && (
        <span className="ml-1 text-muted">
          + {contributors.length}{" "}
          {contributors.length === 1 ? "contributor" : "contributors"}
        </span>
      )}
    </div>
  );
}
