import { NextResponse } from "next/server";
import { listContributors, buildContributorProfile } from "@/lib/contributors";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/contributors
 *
 * Returns all contributor profiles sorted by editCount descending.
 * Optionally pass `?handle=alice` to get a single profile (convenience).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const handle = url.searchParams.get("handle");

    if (handle) {
      const profile = await buildContributorProfile(handle);
      // 404 if handle has zero activity
      if (profile.editCount === 0 && profile.commentCount === 0) {
        return NextResponse.json(
          { error: `no activity found for handle: ${handle}` },
          { status: 404 },
        );
      }
      return NextResponse.json(profile);
    }

    const contributors = await listContributors();
    return NextResponse.json({ contributors });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
