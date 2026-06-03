// @yoyoevolve X-ingest loop, as a Cloudflare cron Worker.
//
// On its Cron Trigger (every 10 min) it searches X for replies of the form
// "@yoyoevolve yopedia ..." and, for each reply from a registered yopedia user,
// ingests what the REPLIED-TO (parent) tweet points to — its full long-form X
// Article (via the X API `article` field) and/or its external links — into that
// user's yoyo, by calling the deployed yopedia ingest endpoint with the system
// token. It never ingests plain tweet text.
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

// ASCII-only subset of src/lib/slugify.ts — sufficient because X usernames are
// [A-Za-z0-9_] (no CJK/whitespace), so it matches slugify() for all valid handles.
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface Summary {
  ingested: number;
  skipped: number;
  failed: number;
  mentions: number;
  note?: string;
}

function externalLinks(tweet: { entities?: { urls?: { expanded_url?: string; url?: string }[] } }): string[] {
  return (tweet.entities?.urls ?? [])
    .map((u) => u.expanded_url || u.url || "")
    .filter((u) => {
      try {
        const { protocol, hostname } = new URL(u);
        return /^https?:$/.test(protocol) && !SKIP_HOSTS.has(hostname);
      } catch {
        return false;
      }
    });
}

async function run(env: Env): Promise<Summary> {
  const X_BEARER = env.X_BEARER_TOKEN;
  const SERVICE = env.YOPEDIA_SERVICE_TOKEN;
  const BASE = env.YOPEDIA_URL ?? "https://yopedia.yuanhao-li.workers.dev";
  if (!X_BEARER || !SERVICE) {
    console.log("X_BEARER_TOKEN or YOPEDIA_SERVICE_TOKEN not set — skipping.");
    return { ingested: 0, skipped: 0, failed: 0, mentions: 0, note: "unconfigured" };
  }

  const sinceId = await env.CURSOR.get(CURSOR_KEY);
  const q = encodeURIComponent(`@${HANDLE} ${TRIGGER} is:reply -is:retweet`);
  const bound = sinceId
    ? `&since_id=${sinceId}`
    : `&start_time=${new Date(Date.now() - 48 * 3600 * 1000).toISOString()}`;
  const url =
    `https://api.twitter.com/2/tweets/search/recent?query=${q}` +
    `&max_results=100${bound}` +
    `&expansions=referenced_tweets.id,author_id` +
    `&tweet.fields=entities,author_id,referenced_tweets,article,created_at` +
    `&user.fields=username`;

  let payload: {
    data?: {
      author_id: string;
      referenced_tweets?: { type: string; id: string }[];
    }[];
    includes?: {
      users?: { id: string; username: string }[];
      tweets?: {
        id: string;
        article?: { title?: string; text?: string };
        entities?: { urls?: { expanded_url?: string; url?: string }[] };
      }[];
    };
    meta?: { newest_id?: string; result_count?: number };
  };
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${X_BEARER}` } });
    if (!res.ok) {
      const bodyText = await res.text();
      // A bad/revoked bearer is systemic — surface it loudly. A stale since_id
      // can also be rejected; clear it so the next run self-heals via the window.
      if (res.status === 401 || res.status === 403) {
        if (sinceId) await env.CURSOR.delete(CURSOR_KEY);
        throw new Error(`X rejected the bearer token (${res.status}: ${bodyText})`);
      }
      if (sinceId) await env.CURSOR.delete(CURSOR_KEY);
      console.warn(`X search failed (${res.status}: ${bodyText}) — transient, skipping.`);
      return { ingested: 0, skipped: 0, failed: 0, mentions: 0, note: "x-error" };
    }
    payload = await res.json();
  } catch (err) {
    console.warn("X unreachable — skipping this run:", (err as Error)?.message ?? err);
    return { ingested: 0, skipped: 0, failed: 0, mentions: 0, note: "x-unreachable" };
  }

  const mentions = payload.data ?? [];
  const userById = Object.fromEntries(
    (payload.includes?.users ?? []).map((u) => [u.id, u.username]),
  );
  const tweetById = Object.fromEntries(
    (payload.includes?.tweets ?? []).map((t) => [t.id, t]),
  );
  if (mentions.length === 0) {
    console.log("No new @yoyoevolve yopedia reply-mentions. Nothing to ingest.");
    return { ingested: 0, skipped: 0, failed: 0, mentions: 0 };
  }

  let ingested = 0;
  let skipped = 0;
  let failed = 0;

  async function ingestInto(agentId: string, body: unknown, label: string): Promise<boolean | null> {
    const res = await fetch(`${BASE}/api/agents/${agentId}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 200) {
      const data = (await res.json().catch(() => ({}))) as { slug?: string; deduped?: boolean };
      console.log(`✓ ${agentId}: ${label} → ${data.slug ?? "(ok)"}${data.deduped ? " (deduped)" : ""}`);
      return true;
    }
    if (res.status === 404) {
      console.log(`· ${agentId} is not a yopedia user — skipped (${label})`);
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`service token rejected (${res.status}) — check YOPEDIA_SERVICE_TOKEN`);
    }
    console.warn(`! ${agentId}: ingest failed (${res.status}) (${label})`);
    return false;
  }

  for (const mention of mentions) {
    const handle = userById[mention.author_id];
    if (!handle) {
      console.warn(`! mention by ${mention.author_id}: author not expanded — skipping`);
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

    const jobs: { body: unknown; label: string }[] = [];
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
      const ok = await ingestInto(agentId, job.body, job.label);
      if (ok === true) ingested++;
      else if (ok === null) {
        skipped++;
        break; // not a user → skip this handle's remaining jobs
      } else failed++;
    }
  }

  console.log(`Done: ${ingested} ingested, ${skipped} skipped, ${failed} failed (from ${mentions.length} mentions).`);

  // Advance the cursor only on a clean run — a failed ingest must be retried.
  if (failed === 0 && payload.meta?.newest_id) {
    await env.CURSOR.put(CURSOR_KEY, payload.meta.newest_id);
  }

  return { ingested, skipped, failed, mentions: mentions.length };
}

export default {
  // Cron Trigger (every 10 min).
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await run(env);
  },

  // Manual trigger for testing — gated by the system token.
  async fetch(req: Request, env: Env): Promise<Response> {
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer || bearer !== env.YOPEDIA_SERVICE_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
    const summary = await run(env);
    return Response.json(summary);
  },
};
