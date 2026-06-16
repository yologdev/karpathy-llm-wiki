# task-consumer Worker

The consumer for the **yopedia agent task queue** (Cloudflare Queues), as a
**standalone Worker** (so it gets a first-class Queues consumer without wrapping
the OpenNext entry).

It drains the **`yopedia-tasks`** queue and, for each message, POSTs the task to
the deployed main app's **`POST /api/tasks/run`** with the system token. It is a
**thin dispatcher** — the actual work (`reconcile` a page from a discussion
thread, async `ingest`) runs in the main app, which has the full `src/lib` and
the OpenNext request context. This worker imports **no `src/lib` code** (that
would transitively pull Clerk/Next + require the OpenNext context it can't
provide).

**Producers** (who enqueues) live in the main app: the "Ask yoyo to address this"
button (`/api/wiki/<slug>/discuss/<idx>/ask-yoyo`), and this worker's **daily
cron** → `POST /api/tasks/scan` (autonomous maintenance, Q2). `enqueueTask()`
(`src/lib/tasks.ts`) sends to the `TASK_QUEUE` producer binding, and no-ops
gracefully off the Workers runtime.

This worker has two triggers: the **queue consumer** (drains `yopedia-tasks`) and
a **cron** (`scheduled()`, daily) that POSTs `/api/tasks/scan`.

### Autonomous maintenance (Q2)

The daily cron scans the **commons** (public pages only) for upkeep no human
reports and enqueues `maintain` tasks:

- a **`disputed`** page with an open discussion thread whose latest comment is
  from a human (yoyo hasn't already answered) → **reconcile** it;
- a page past its **`expiry`** that has a `source_url` → **re-ingest** from source.

Guardrails: commons-only (never a private vault page), skip pages edited today,
skip disputes yoyo already replied to, and a per-scan cap.

#### It is OFF by default

The cron runs daily regardless, but the scan **dry-runs** — it logs/returns what
it *would* enqueue and enqueues **nothing** — until the flag is on. So shipping
the cron is safe; you enable it deliberately, after inspecting a few dry-runs.

The switch is the **`AUTONOMOUS_MAINTENANCE`** env var on the **main** worker
(that's where the scan route runs — *not* this consumer). Any value other than
exactly `"on"` (including unset) = dry-run.

#### How to enable it

**1. Inspect what it would do** (dry-run, works regardless of the flag). Replace
the token with the same `YOPEDIA_SERVICE_TOKEN` the workers use:

```sh
curl -s -X POST "https://yopedia.yuanhao-li.workers.dev/api/tasks/scan?dry=1" \
  -H "Authorization: Bearer <YOPEDIA_SERVICE_TOKEN>" | jq
# → { enabled, dry: true, found, enqueued: 0, tasks: [ { op, slug, threadIndex? } … ] }
```

Or watch the daily cron's own dry-runs in the logs:

```sh
pnpm exec wrangler tail --config workers/task-consumer/wrangler.jsonc
# look for:  task-consumer cron: scan → 200 { … dry:true found:N enqueued:0 … }
```

**2. Turn it on.** It's a non-sensitive flag, so the version-controlled way is
preferred — add it to the **main** `wrangler.jsonc` `vars` block and deploy:

```jsonc
// wrangler.jsonc  (repo root — the MAIN worker)
"vars": {
  "NEXT_PUBLIC_OWNER_HANDLE": "yuanhao",
  "AUTONOMOUS_MAINTENANCE": "on"
}
```

```sh
git add wrangler.jsonc && git commit -m "ops: enable autonomous maintenance" && git push
# (push to main auto-deploys via deploy-cloudflare.yml)
```

Quick toggle without a code change (not version-controlled — prefer the var):

```sh
pnpm exec wrangler secret put AUTONOMOUS_MAINTENANCE   # enter:  on
```

**3. Verify it's live:** re-run the scan without `?dry=1` (or wait for the cron)
and confirm `enabled: true`, `dry: false`, and `enqueued > 0` when there's work:

```sh
curl -s -X POST "https://yopedia.yuanhao-li.workers.dev/api/tasks/scan" \
  -H "Authorization: Bearer <YOPEDIA_SERVICE_TOKEN>" | jq
```

#### Tuning

- **Per-scan cap** (default 10) — pass `?cap=N` when invoking the scan, or change
  `DEFAULT_MAINTENANCE_CAP` in `src/lib/maintenance.ts`.
- **Cadence** — the cron schedule is `triggers.crons` in **this** worker's
  `wrangler.jsonc` (default `0 6 * * *`, daily 06:00 UTC).

#### How to disable

Remove `"AUTONOMOUS_MAINTENANCE"` from the main `wrangler.jsonc` `vars` (and
deploy), or `pnpm exec wrangler secret delete AUTONOMOUS_MAINTENANCE` if you set
it as a secret. The cron keeps running but reverts to harmless dry-runs.

**Ack/retry** maps onto Cloudflare Queues:
- `2xx` → ack (done).
- `4xx` → poison (malformed / not-found) → ack + drop (don't retry forever).
- `5xx` / network → retry (CF redelivers; → dead-letter queue after `max_retries`).

> **Same-zone fetch note:** the `/api/tasks/run` call targets the main yopedia
> Worker on the same account. A plain same-zone Worker→Worker `fetch()` is blocked
> (**error 1042**), so this Worker sets the **`global_fetch_strictly_public`**
> compatibility flag.

## One-time setup (operator)

```sh
# Create the queue + dead-letter queue:
pnpm exec wrangler queues create yopedia-tasks
pnpm exec wrangler queues create yopedia-tasks-dlq

# Secret (same value as the main Worker's):
pnpm exec wrangler secret put YOPEDIA_SERVICE_TOKEN --config workers/task-consumer/wrangler.jsonc

# First deploy (afterwards it auto-deploys via deploy-cloudflare.yml on push to main):
pnpm exec wrangler deploy --config workers/task-consumer/wrangler.jsonc
```

The main app's `wrangler.jsonc` already declares the `TASK_QUEUE` producer
binding for the same `yopedia-tasks` queue.

## Test it

Open a discussion thread on a commons page → **🛠 Ask yoyo to address this** →
within a queue cycle the page updates and yoyo replies in the thread. Logs:

```sh
pnpm exec wrangler tail --config workers/task-consumer/wrangler.jsonc
```

Health check: `GET https://yopedia-task-consumer.<subdomain>.workers.dev` → `ok`.
