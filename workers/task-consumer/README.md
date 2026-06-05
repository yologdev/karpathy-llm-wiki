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
button (`/api/wiki/<slug>/discuss/<idx>/ask-yoyo`) today; autonomous maintenance
crons and batch ingest later. `enqueueTask()` (`src/lib/tasks.ts`) sends to the
`TASK_QUEUE` producer binding, and no-ops gracefully off the Workers runtime.

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
