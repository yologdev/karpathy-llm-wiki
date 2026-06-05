# task-consumer Worker

The consumer for the **yopedia agent task queue** (Cloudflare Queues), as a
**standalone Worker** (so it gets a first-class Queues consumer without wrapping
the OpenNext entry — same reasoning as `workers/x-ingest/`).

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

The cron scans the wiki for upkeep no human reports — a `disputed` page with an
open thread awaiting a reply → reconcile; an expired page with a `source_url` →
re-ingest — and enqueues `maintain` tasks. It is **off by default**: the scan
**dry-runs** (logs what it *would* enqueue, enqueues nothing) until you set
`AUTONOMOUS_MAINTENANCE="on"` on the **main** worker. So the cron is safe to ship
before you enable it — watch a few dry-runs in the logs first, then enable:

```sh
# Inspect what it would do (dry-run, regardless of the flag):
curl -s -X POST "https://yopedia.<sub>.workers.dev/api/tasks/scan?dry=1" \
  -H "Authorization: Bearer <YOPEDIA_SERVICE_TOKEN>" | jq

# Enable autonomous maintenance (set on the MAIN worker, then redeploy/restart):
#   add  "AUTONOMOUS_MAINTENANCE": "on"  to wrangler.jsonc `vars`, or
pnpm exec wrangler secret put AUTONOMOUS_MAINTENANCE   # value: on
```

**Ack/retry** maps onto Cloudflare Queues:
- `2xx` → ack (done).
- `4xx` → poison (malformed / not-found) → ack + drop (don't retry forever).
- `5xx` / network → retry (CF redelivers; → dead-letter queue after `max_retries`).

> **Same-zone fetch note:** the `/api/tasks/run` call targets the main yopedia
> Worker on the same account. A plain same-zone Worker→Worker `fetch()` is blocked
> (**error 1042**), so this Worker sets the **`global_fetch_strictly_public`**
> compatibility flag (same as `x-ingest`).

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
