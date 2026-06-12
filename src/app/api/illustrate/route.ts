import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { generateYoyoIllustration } from "@/lib/illustration";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

const MAX_SCENE = 800;

/**
 * POST /api/illustrate — generate (or return a cached) yoyo brand illustration
 * for a scene, as a self-contained jpeg `data:` URI. Used by the slides/HTML
 * renderers to fill `yoyo-illustration` directives client-side.
 *
 * Auth-gated (writes are middleware-gated to a signed-in user) because
 * generation hits a paid image API; repeat scenes are cached, so most calls are
 * free reads. Always 200s with `{ image }` (possibly null) so a generation
 * failure degrades to "no illustration", never a broken answer.
 */
export async function POST(request: Request) {
  try {
    // Middleware write-gates /api POSTs to a signed-in user, so only a Clerk
    // session reaches here (no service-token caller). Re-check defensively.
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const scene = typeof body.scene === "string" ? body.scene.trim() : "";
    const lang =
      typeof body.lang === "string" && body.lang.trim() ? body.lang.trim() : "English";

    if (!scene) {
      return NextResponse.json({ error: "scene is required" }, { status: 400 });
    }
    if (scene.length > MAX_SCENE) {
      return NextResponse.json(
        { error: `scene must be ≤ ${MAX_SCENE} characters` },
        { status: 400 },
      );
    }

    const image = await generateYoyoIllustration(scene, lang);
    return NextResponse.json({ image });
  } catch (error) {
    logger.error("illustration", "illustrate route error", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
