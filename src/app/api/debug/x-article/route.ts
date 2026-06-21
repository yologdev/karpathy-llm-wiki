import { NextRequest, NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";

/**
 * TEMPORARY admin-only diagnostic: call the X API v2 recent-search EXACTLY as
 * `fetchArticleViaApi` does, using the worker's own `X_BEARER_TOKEN`, and return
 * the RAW response so we can see whether `article.text` is populated or empty
 * (and any access `errors`/`title`/`detail`). The bearer is never returned.
 *
 * GET /api/debug/x-article?id=<tweetId>&handle=<screen_name>
 *
 * REMOVE after diagnosing the empty-article-body issue.
 */
export async function GET(request: NextRequest) {
  const principal = await getPrincipal();
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(principal)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const handle = searchParams.get("handle");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) return NextResponse.json({ error: "X_BEARER_TOKEN not set on worker" }, { status: 500 });

  const query = handle ? `conversation_id:${id} from:${handle}` : `conversation_id:${id}`;
  const endpoint =
    `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}` +
    `&max_results=10&tweet.fields=article,note_tweet,conversation_id,author_id`;

  let status = 0;
  let raw: unknown = null;
  try {
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${bearer}` } });
    status = res.status;
    raw = await res.json().catch(() => null);
  } catch (e) {
    return NextResponse.json({ query, error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }

  // Summarize the article shape per tweet so the answer is obvious at a glance,
  // and include the full raw payload for completeness (no secrets in it).
  const data = (raw as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const summary = data.map((t) => {
    const article = (t.article ?? null) as Record<string, unknown> | null;
    const note = (t.note_tweet ?? null) as Record<string, unknown> | null;
    return {
      id: t.id,
      hasArticle: article !== null,
      articleKeys: article ? Object.keys(article) : [],
      articleTextLen: typeof article?.text === "string" ? (article.text as string).length : null,
      articleTitle: article?.title ?? null,
      noteTweetTextLen:
        typeof note?.text === "string"
          ? (note.text as string).length
          : typeof (note?.note_tweet_results as Record<string, unknown>)?.text === "string"
            ? ((note!.note_tweet_results as Record<string, unknown>).text as string).length
            : null,
    };
  });

  return NextResponse.json({
    query,
    httpStatus: status,
    tweetCount: data.length,
    summary,
    errors: (raw as { errors?: unknown })?.errors ?? null,
    title: (raw as { title?: unknown })?.title ?? null,
    detail: (raw as { detail?: unknown })?.detail ?? null,
    meta: (raw as { meta?: unknown })?.meta ?? null,
    raw,
  });
}
