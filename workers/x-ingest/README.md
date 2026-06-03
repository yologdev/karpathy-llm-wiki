# x-ingest cron Worker

The `@yoyoevolve` X-ingest loop as a **standalone Cloudflare Worker** with a
**Cron Trigger** (reliable cadence, unlike GitHub Actions schedules). It polls X
every 10 minutes and ingests into yopedia via the deployed ingest endpoint.

What it does each run:
- Searches X with **`(to:yoyoevolve OR @yoyoevolve) yopedia is:reply -is:retweet`**.
  The `(to: OR @)` group catches both a reply *directly to* @yoyoevolve's tweet
  (where `@yoyoevolve` is just the auto-prepended reply prefix, which the bare
  keyword doesn't reliably match) and a reply elsewhere that CCs @yoyoevolve.
- For each reply from a **registered** yopedia user, ingests what the
  **replied-to (parent) tweet** points to — its full long-form **X Article**
  (`tweet.fields=article`) and/or its **external links** — into **that user's own
  yopedia content** (a normal page owned/authored by them, in their `/u/<handle>`
  + the public commons), via `POST /api/agents/<handle>--yoyo/ingest` with the
  system token and **`asOwner: true`**. The `@yoyoevolve` mention is the "save
  this to my wiki" command channel — it is **not** written to the agent's scoped
  knowledge, and plain tweet text is never ingested.
- **Article images (best-effort):** the search expands `attachments.media_keys`
  + `media.fields`, and any image URLs the X API exposes for the parent (attached
  media, article entities, image refs in the article text) are appended to the
  ingest text as markdown. The official `article` API field exposes **no** image
  URLs, so for Articles the worker additionally fetches the **cover image** from
  the unauthenticated syndication CDN (`cdn.syndication.twimg.com/tweet-result`
  → `article.cover_media...original_img_url`) — fail-soft (any error → text-only).
  Inline Article body images aren't exposed by any X surface. Use `?debug=1` to
  see API-exposed media (`articleImageUrls` / `includesMedia`) per sample.

> **Same-zone fetch note:** the ingest call targets the main yopedia Worker on
> the same account (`yopedia.<sub>.workers.dev`). A plain Worker→Worker `fetch()`
> on the same zone is blocked by Cloudflare (**error 1042**), so this Worker sets
> the **`global_fetch_strictly_public`** compatibility flag, which makes `fetch()`
> resolve as a normal public request. (A service binding is the alternative, but
> it still 1042s when called with the real same-zone hostname as the URL.)
- Tracks a **`since_id` cursor in KV** (near-zero overlap); first run / missing /
  stale cursor falls back to a 48h window. The cursor advances only on a clean
  run, so a failed ingest is retried.

It is intentionally **not** part of the main Next/OpenNext Worker (so it gets a
first-class Cron Trigger) and is excluded from the app's tsconfig/eslint.

## One-time setup (operator)

```sh
# Secrets (stored on the cron Worker):
pnpm exec wrangler secret put X_BEARER_TOKEN        --config workers/x-ingest/wrangler.jsonc
pnpm exec wrangler secret put YOPEDIA_SERVICE_TOKEN --config workers/x-ingest/wrangler.jsonc   # same value as the main Worker

# First deploy (afterwards it auto-deploys via deploy-cloudflare.yml on push to main):
pnpm exec wrangler deploy --config workers/x-ingest/wrangler.jsonc
```

The cursor reuses the existing yopedia KV namespace (bound as `CURSOR`) under the
key `x-ingest:since_id`. To use a dedicated namespace instead, create one with
`pnpm exec wrangler kv namespace create x-ingest` and swap **only the `id`** in
`wrangler.jsonc` — keep `"binding": "CURSOR"`, or `env.CURSOR` breaks.

## Trigger it manually (testing)

```sh
# Run the loop once (gated by the system token):
curl -X POST "https://yopedia-x-ingest.<your-subdomain>.workers.dev" \
  -H "Authorization: Bearer <YOPEDIA_SERVICE_TOKEN>"
# → { ingested, skipped, dropped, failed, mentions }  (plus a `note` when skipped/unconfigured)
```

### Debug probe (why didn't my reply match?)

A read-only probe that runs several query variants over a recent window and
reports what X returns for each — **no ingest, no cursor write**. Use it to see
which match pattern X honors for a given reply:

```sh
curl -X POST "https://yopedia-x-ingest.<your-subdomain>.workers.dev/?debug=1&hours=24" \
  -H "Authorization: Bearer <YOPEDIA_SERVICE_TOKEN>" | jq
# → { window_hours, variants: { live, toOnly, mentionOnly, noTrigger, broad: { result_count, samples[] } } }
```

If `live`/`toOnly` find your reply but `mentionOnly` (the old bare-`@` query)
doesn't, that confirms the `to:` operator was the fix. Each sample shows the
author, a text snippet, and whether the parent has an article/links.

Logs: `pnpm exec wrangler tail --config workers/x-ingest/wrangler.jsonc`.
