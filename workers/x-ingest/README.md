# x-ingest cron Worker

The `@yoyoevolve` X-ingest loop as a **standalone Cloudflare Worker** with a
**Cron Trigger** (reliable cadence, unlike GitHub Actions schedules). It polls X
every 10 minutes and ingests into yopedia via the deployed ingest endpoint.

What it does each run:
- Searches X for replies matching **`@yoyoevolve yopedia is:reply -is:retweet`**.
- For each reply from a **registered** yopedia user, ingests what the
  **replied-to (parent) tweet** points to — its full long-form **X Article**
  (`tweet.fields=article`) and/or its **external links** — into that user's
  `<handle>--yoyo` via `POST /api/agents/<id>/ingest` with the system token.
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
# The Worker also exposes a fetch handler gated by the system token:
curl -X POST "https://yopedia-x-ingest.<your-subdomain>.workers.dev" \
  -H "Authorization: Bearer <YOPEDIA_SERVICE_TOKEN>"
# → { ingested, skipped, dropped, failed, mentions }  (plus a `note` when skipped/unconfigured)
```

Logs: `pnpm exec wrangler tail --config workers/x-ingest/wrangler.jsonc`.
