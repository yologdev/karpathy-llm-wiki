// @yoyoevolve X-ingest loop, as a Cloudflare cron Worker.
//
// On its Cron Trigger (every 10 min) it searches X for replies of the form
// "@yoyoevolve yopedia ..." and, for each reply from a registered yopedia user,
// ingests what the REPLIED-TO (parent) tweet points to — its full long-form X
// Article (via the X API `article` field) and/or its external links — into the
// mentioner's OWN yopedia content (a normal page owned/authored by them, in
// their /u/<handle> + the public commons), by POSTing the deployed ingest
// endpoint with the system token and `asOwner: true`. The @yoyoevolve mention
// is the "save this to my wiki" command channel; it never ingests plain tweet
// text and never writes into the agent's scoped knowledge.
//
// Cursor: `since_id` persisted in KV, so each run fetches only new mentions
// (near-zero overlap). First run / missing / stale cursor → 48h safety window.
// The cursor advances only on a clean run, so a failed ingest is retried.

// Minimal local types (avoids a @cloudflare/workers-types dependency).
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
interface Env {
  CURSOR: KVNamespace;
  X_BEARER_TOKEN?: string;
  YOPEDIA_SERVICE_TOKEN?: string;
  YOPEDIA_URL?: string;
}

const HANDLE = "yoyoevolve";
const TRIGGER = "yopedia"; // only "@yoyoevolve yopedia ..." replies fire the loop
const CURSOR_KEY = "x-ingest:since_id";
const SKIP_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "t.co",
  "www.x.com",
  "www.twitter.com",
]);

// The live query. `(to:HANDLE OR @HANDLE)` catches BOTH a reply directly to
// @yoyoevolve's tweet (where the @mention is just the auto-prepended reply
// prefix, which the bare `@HANDLE` keyword does not reliably match) AND a reply
// to someone else that explicitly CCs @yoyoevolve in the body.
const QUERY = `(to:${HANDLE} OR @${HANDLE}) ${TRIGGER} is:reply -is:retweet`;

// ASCII-only subset of src/lib/slugify.ts — sufficient because X usernames are
// [A-Za-z0-9_] (no CJK/whitespace), so it matches slugify() for all valid handles.
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface Summary {
  ingested: number;
  skipped: number; // non-user (404), unavailable parent, or nothing ingestable
  dropped: number; // permanently rejected (4xx) — consciously discarded, not retried
  failed: number; // transient (5xx/429) — holds the cursor so the run retries
  mentions: number;
  note?: string;
}

// The three terminal outcomes of one ingest attempt (a 4th, auth rejection,
// throws instead of returning so the whole run aborts loudly). A string union
// rather than boolean|null so the consumer's branching is self-documenting and
// a future truthiness slip can't conflate "not a user" with "failed".
type IngestOutcome = "ingested" | "not-a-user" | "dropped" | "failed";

// ---------------------------------------------------------------------------
// X API types (only the fields we read; res.json() is an unchecked cast, so
// every access below is optional-chained or guarded).
// ---------------------------------------------------------------------------
interface XTweet {
  id: string;
  author_id?: string;
  text?: string;
  referenced_tweets?: { type: string; id: string }[];
  article?: { title?: string; text?: string };
  entities?: { urls?: { expanded_url?: string; url?: string }[] };
}
interface XSearchPayload {
  data?: XTweet[];
  includes?: { users?: { id: string; username: string }[]; tweets?: XTweet[] };
  meta?: { newest_id?: string; result_count?: number };
}

function externalLinks(tweet: XTweet): string[] {
  return (tweet.entities?.urls ?? [])
    .map((u) => u.expanded_url || u.url || "")
    .filter((u) => {
      try {
        const { protocol, hostname } = new URL(u);
        return /^https?:$/.test(protocol) && !SKIP_HOSTS.has(hostname);
      } catch {
        return false; // malformed/relative URL from X — unusable, drop it
      }
    });
}

/** Build the X recent-search URL for a query + time/cursor bound. */
function searchUrl(query: string, bound: string): string {
  return (
    `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}` +
    `&max_results=100${bound}` +
    `&expansions=referenced_tweets.id,author_id` +
    `&tweet.fields=entities,author_id,referenced_tweets,article,created_at` +
    `&user.fields=username`
  );
}

async function run(env: Env): Promise<Summary> {
  const X_BEARER = env.X_BEARER_TOKEN;
  const SERVICE = env.YOPEDIA_SERVICE_TOKEN;
  const BASE = env.YOPEDIA_URL ?? "https://yopedia.yuanhao-li.workers.dev";
  if (!X_BEARER || !SERVICE) {
    console.log("X_BEARER_TOKEN or YOPEDIA_SERVICE_TOKEN not set — skipping.");
    return { ingested: 0, skipped: 0, dropped: 0, failed: 0, mentions: 0, note: "unconfigured" };
  }

  const sinceId = await env.CURSOR.get(CURSOR_KEY);
  const bound = sinceId
    ? `&since_id=${sinceId}`
    : `&start_time=${new Date(Date.now() - 48 * 3600 * 1000).toISOString()}`;

  let payload: XSearchPayload;
  try {
    const res = await fetch(searchUrl(QUERY, bound), {
      headers: { Authorization: `Bearer ${X_BEARER}` },
    });
    if (!res.ok) {
      const bodyText = await res.text();
      // A bad/revoked bearer is systemic — surface it loudly (leaving the
      // cursor intact: it's still valid once the token is fixed).
      if (res.status === 401 || res.status === 403) {
        throw new Error(`X rejected the bearer token (${res.status}: ${bodyText})`);
      }
      // A 400 from recent-search typically means a stale/too-old since_id —
      // clear it so the next run self-heals via the 48h window. On a 5xx (X
      // outage) keep the cursor so we don't needlessly widen the next fetch.
      if (res.status === 400 && sinceId) await env.CURSOR.delete(CURSOR_KEY);
      console.warn(`X search failed (${res.status}: ${bodyText}) — transient, skipping.`);
      return { ingested: 0, skipped: 0, dropped: 0, failed: 0, mentions: 0, note: "x-error" };
    }
    payload = await res.json();
  } catch (err) {
    console.warn("X unreachable — skipping this run:", (err as Error)?.message ?? err);
    return { ingested: 0, skipped: 0, dropped: 0, failed: 0, mentions: 0, note: "x-unreachable" };
  }

  const mentions = payload.data ?? [];
  const userById = Object.fromEntries(
    (payload.includes?.users ?? []).map((u) => [u.id, u.username]),
  );
  const tweetById = Object.fromEntries(
    (payload.includes?.tweets ?? []).map((t) => [t.id, t]),
  );
  if (mentions.length === 0) {
    console.log(`No new mentions for query [${QUERY}]. Nothing to ingest.`);
    return { ingested: 0, skipped: 0, dropped: 0, failed: 0, mentions: 0 };
  }

  let ingested = 0;
  let skipped = 0;
  let dropped = 0;
  let failed = 0;

  // POST one source into <handle>'s OWN yopedia content (asOwner). The agent id
  // (<handle>--yoyo) is only used to resolve the owner + gate on "registered
  // user" (404 ⇒ not a user); the resulting page is owned/authored by <handle>.
  async function ingestForOwner(agentId: string, body: object, label: string): Promise<IngestOutcome> {
    const res = await fetch(`${BASE}/api/agents/${agentId}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, asOwner: true }),
    });
    if (res.status === 200) {
      // A 200 means the server committed the page, so the outcome is
      // authoritative even if the body is unreadable — but warn rather than
      // silently print "(ok)".
      const data = (await res.json().catch((e) => {
        console.warn(`200 from ${agentId} but body unparseable (${label}): ${e}`);
        return {};
      })) as { slug?: string; deduped?: boolean };
      console.log(`✓ ${agentId} (owner content): ${label} → ${data.slug ?? "(ok)"}${data.deduped ? " (deduped)" : ""}`);
      return "ingested";
    }
    if (res.status === 404) {
      console.log(`· ${agentId} is not a yopedia user — skipped (${label})`);
      return "not-a-user";
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`service token rejected (${res.status}) — check YOPEDIA_SERVICE_TOKEN`);
    }
    if (res.status >= 500 || res.status === 429) {
      // Transient — retry next run. Counting as `failed` holds the cursor.
      console.warn(`! ${agentId}: ingest transient failure (${res.status}) (${label}) — will retry`);
      return "failed";
    }
    // Other 4xx (e.g. 400 bad body): permanent for this exact payload. Retrying
    // is futile and would wedge the cursor forever, blocking all later mentions
    // — so drop it loudly and let the cursor advance past it.
    console.error(`✗ ${agentId}: ingest permanently rejected (${res.status}) (${label}) — dropping`);
    return "dropped";
  }

  for (const mention of mentions) {
    const handle = mention.author_id ? userById[mention.author_id] : undefined;
    if (!handle) {
      console.warn(`! mention by ${mention.author_id ?? "?"}: author not expanded — skipping`);
      skipped++;
      continue;
    }
    const parentId = (mention.referenced_tweets ?? []).find((r) => r.type === "replied_to")?.id;
    const parent = parentId ? tweetById[parentId] : undefined;
    if (!parent) {
      console.log(`· @${handle}: replied-to tweet unavailable — skipping`);
      skipped++;
      continue;
    }

    const jobs: { body: object; label: string }[] = [];
    const article = parent.article;
    if (article && (article.text || article.title)) {
      const title = article.title || `X Article (shared by @${handle})`;
      jobs.push({ body: { text: article.text || title, title }, label: `article "${title}"` });
    } else if (article) {
      console.warn(`! @${handle}: parent 'article' has an unexpected shape — skipping the article`);
    }
    for (const link of externalLinks(parent)) {
      jobs.push({ body: { url: link }, label: link });
    }
    if (jobs.length === 0) {
      skipped++;
      continue;
    }

    const agentId = `${slug(handle)}--yoyo`;
    for (const job of jobs) {
      const outcome = await ingestForOwner(agentId, job.body, job.label);
      if (outcome === "ingested") ingested++;
      else if (outcome === "not-a-user") {
        skipped++;
        break; // not a user → skip this handle's remaining jobs
      } else if (outcome === "dropped") dropped++;
      else failed++;
    }
  }

  console.log(
    `Done: ${ingested} ingested, ${skipped} skipped, ${dropped} dropped, ${failed} failed (from ${mentions.length} mentions).`,
  );

  // Advance the cursor only when nothing is left to retry. `failed` (transient)
  // holds the cursor so the run retries; `dropped` (permanent) does not, so a
  // poison job can't wedge the loop and block later mentions forever.
  if (failed === 0 && payload.meta?.newest_id) {
    await env.CURSOR.put(CURSOR_KEY, payload.meta.newest_id);
  }

  return { ingested, skipped, dropped, failed, mentions: mentions.length };
}

// ---------------------------------------------------------------------------
// Debug probe: runs several query variants over a recent window and reports
// what X returns for each, WITHOUT ingesting or touching the cursor. Lets an
// operator (with the system token) see exactly which match pattern X honors
// for a given reply. GET/POST `?debug=1` (optionally `&hours=N`).
// ---------------------------------------------------------------------------
async function probe(env: Env, hours: number): Promise<unknown> {
  const X_BEARER = env.X_BEARER_TOKEN;
  if (!X_BEARER) return { error: "X_BEARER_TOKEN not set" };
  const bound = `&start_time=${new Date(Date.now() - hours * 3600 * 1000).toISOString()}`;
  const variants: Record<string, string> = {
    live: QUERY,
    toOnly: `to:${HANDLE} ${TRIGGER} is:reply -is:retweet`,
    mentionOnly: `@${HANDLE} ${TRIGGER} is:reply -is:retweet`,
    noTrigger: `to:${HANDLE} is:reply -is:retweet`,
    broad: `${TRIGGER} is:reply -is:retweet`,
  };

  const results: Record<string, unknown> = {};
  for (const [name, query] of Object.entries(variants)) {
    const res = await fetch(searchUrl(query, bound), {
      headers: { Authorization: `Bearer ${X_BEARER}` },
    });
    if (!res.ok) {
      results[name] = { query, status: res.status, error: (await res.text()).slice(0, 300) };
      continue;
    }
    const payload: XSearchPayload = await res.json();
    const userById = Object.fromEntries(
      (payload.includes?.users ?? []).map((u) => [u.id, u.username]),
    );
    const tweetById = Object.fromEntries(
      (payload.includes?.tweets ?? []).map((t) => [t.id, t]),
    );
    results[name] = {
      query,
      result_count: payload.meta?.result_count ?? (payload.data?.length ?? 0),
      samples: (payload.data ?? []).slice(0, 5).map((m) => {
        const parentId = (m.referenced_tweets ?? []).find((r) => r.type === "replied_to")?.id;
        const parent = parentId ? tweetById[parentId] : undefined;
        return {
          id: m.id,
          author: m.author_id ? userById[m.author_id] : undefined,
          text: (m.text ?? "").slice(0, 80),
          parentId: parentId ?? null,
          parentHasArticle: !!parent?.article,
          parentLinks: parent ? externalLinks(parent).length : 0,
        };
      }),
    };
  }
  return { window_hours: hours, variants: results };
}

export default {
  // Cron Trigger (every 10 min).
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const s = await run(env);
    // Fail the invocation loudly if every attempt failed and nothing landed —
    // a dead loop (outage / wrong URL) must not report success run after run.
    // Mirrors the old GitHub Actions `exit 1` guard. `dropped` is excluded: a
    // permanently-rejected job is a known bad payload, not an outage.
    if (s.ingested === 0 && s.failed > 0) {
      throw new Error(
        `All ${s.failed} transient ingest attempt(s) failed and nothing was ingested — likely an outage or wrong YOPEDIA_URL.`,
      );
    }
  },

  // Manual trigger / debug probe — gated by the system token. The regex requires
  // a non-empty bearer, so an unconfigured YOPEDIA_SERVICE_TOKEN (undefined)
  // rejects every request rather than auth-bypassing.
  //   POST           → run the loop once, returns the Summary
  //   ?debug=1       → run the read-only query probe (no ingest, no cursor write)
  async fetch(req: Request, env: Env): Promise<Response> {
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer || bearer !== env.YOPEDIA_SERVICE_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
    const params = new URL(req.url).searchParams;
    if (params.get("debug")) {
      const hours = Math.min(Math.max(Number(params.get("hours")) || 24, 1), 168);
      return Response.json(await probe(env, hours));
    }
    return Response.json(await run(env));
  },
};
