import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/query";
import { getStorage } from "@/lib/storage";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/query/demo?q=<question>
 *
 * A PUBLIC, no-auth taste of the Ask feature for signed-out visitors: it answers
 * ONLY the three homepage sample questions (whitelisted, so it can't be abused
 * as a free anonymous query API). The answer is computed once over PUBLIC
 * content (no principal → commons only, so nothing private leaks), cached in KV,
 * and served to everyone after — the owner pays a single LLM call per question.
 *
 * Real querying stays signed-in-only (POST /api/query is write-gated); this is a
 * read-only, fixed-question demo.
 */
const DEMO_QUESTIONS = new Set([
  "What is harness engineering?",
  "How is yopedia different from RAG?",
  "What are the agentic harness patterns?",
]);
const DEMO_CACHE_KEY = "demo-answers";

interface DemoAnswer {
  answer: string;
  sources: string[];
}

export async function GET(req: NextRequest) {
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!DEMO_QUESTIONS.has(q)) {
      return NextResponse.json(
        { error: "Not a demo question" },
        { status: 400 },
      );
    }

    const storage = getStorage();
    const cache =
      (await storage.getIndex<Record<string, DemoAnswer>>(DEMO_CACHE_KEY)) ?? {};
    if (cache[q]) {
      return NextResponse.json({ ...cache[q], cached: true });
    }

    // First request for this question — compute it (public scope), then cache.
    const result = await query(q, "prose", undefined, null);
    const fresh: DemoAnswer = {
      answer: result.answer,
      sources: result.sources,
    };
    try {
      await storage.putIndex(DEMO_CACHE_KEY, { ...cache, [q]: fresh });
    } catch (e) {
      // Caching is best-effort; still return the answer this request computed.
      logger.warn("demo", "failed to cache demo answer", e);
    }
    return NextResponse.json({ ...fresh, cached: false });
  } catch (err) {
    logger.error("demo", "demo query failed", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
