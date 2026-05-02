import { NextResponse } from "next/server";
import { buildContributorProfile } from "@/lib/contributors";
import { getErrorMessage } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ handle: string }>;
}

/**
 * GET /api/contributors/[handle]
 *
 * Returns a single ContributorProfile for the given handle.
 * 404 if the handle has zero activity (editCount + commentCount === 0).
 */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { handle } = await params;

    if (!handle || handle.trim().length === 0) {
      return NextResponse.json(
        { error: "handle must be a non-empty string" },
        { status: 400 },
      );
    }

    const profile = await buildContributorProfile(handle);

    // 404 when handle has no recorded activity
    if (profile.editCount === 0 && profile.commentCount === 0) {
      return NextResponse.json(
        { error: `no activity found for handle: ${handle}` },
        { status: 404 },
      );
    }

    return NextResponse.json(profile);
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
