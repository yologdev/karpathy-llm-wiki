import { NextResponse } from "next/server";
import { listContributors, buildContributorProfile, buildContributorProfiles } from "@/lib/contributors";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/contributors
 *
 * Returns all contributor profiles sorted by editCount descending.
 * Optionally pass `?handle=alice` to get a single profile (convenience).
 * Optionally pass `?handles=alice,bob` to batch-fetch multiple profiles
 * in a single wiki-wide scan.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const handle = url.searchParams.get("handle");
    const handles = url.searchParams.get("handles");
    const principal = await getPrincipal();

    // Batch lookup: ?handles=alice,bob,charlie
    if (handles) {
      const handleList = handles
        .split(",")
        .map((h) => h.trim())
        .filter((h) => h.length > 0);

      if (handleList.length === 0) {
        return NextResponse.json(
          { error: "handles parameter must contain at least one non-empty handle" },
          { status: 400 },
        );
      }

      const profiles = await buildContributorProfiles(handleList, undefined, principal);
      return NextResponse.json({ contributors: profiles });
    }

    // Single-handle lookup: ?handle=alice
    if (handle) {
      const profile = await buildContributorProfile(handle, undefined, principal);
      // 404 if handle has zero activity
      if (profile.editCount === 0 && profile.commentCount === 0) {
        return NextResponse.json(
          { error: `no activity found for handle: ${handle}` },
          { status: 404 },
        );
      }
      return NextResponse.json(profile);
    }

    // List all contributors
    const contributors = await listContributors(principal);
    return NextResponse.json({ contributors });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
