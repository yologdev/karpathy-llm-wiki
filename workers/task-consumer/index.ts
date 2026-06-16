/**
 * yopedia agent task-queue consumer.
 *
 * A thin dispatcher: drains the `yopedia-tasks` Cloudflare Queue and POSTs each
 * message to the main yopedia app's `/api/tasks/run` endpoint with the system
 * token. The actual work (reconcile / ingest) runs in the main app, which has
 * the full `src/lib` + OpenNext request context. This worker imports NO `src/lib`
 * code — that would transitively pull Clerk/Next and the OpenNext context a
 * standalone worker can't provide.
 *
 * Ack/retry maps straight onto Cloudflare Queues semantics:
 *   - 2xx  → ack (done).
 *   - 4xx  → poison (malformed / not-found) → ack + drop (don't retry forever).
 *   - 5xx / network → retry (CF redelivers; → DLQ after max_retries).
 */

interface Env {
  YOPEDIA_URL?: string;
  YOPEDIA_SERVICE_TOKEN?: string;
}

// Minimal Cloudflare Queues consumer types (avoid pulling @cloudflare/workers-types).
interface QueueMessage<T = unknown> {
  readonly id: string;
  readonly body: T;
  ack(): void;
  retry(): void;
}
interface MessageBatch<T = unknown> {
  readonly queue: string;
  readonly messages: QueueMessage<T>[];
}
interface ScheduledEvent {
  readonly scheduledTime: number;
  readonly cron: string;
}

async function runTask(
  base: string,
  token: string,
  message: QueueMessage,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/tasks/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message.body),
    });
  } catch (err) {
    console.error(`task-consumer: fetch failed for ${message.id} — retry`, err);
    message.retry();
    return;
  }

  if (res.status >= 200 && res.status < 300) {
    message.ack();
    return;
  }
  if (res.status >= 400 && res.status < 500) {
    // Permanently-bad task — don't retry it forever.
    const snip = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
    console.warn(`task-consumer: poison ${message.id} (${res.status}): ${snip}`);
    message.ack();
    return;
  }
  // 5xx — transient; let CF redeliver (and DLQ after max_retries).
  console.warn(`task-consumer: transient ${message.id} (${res.status}) — retry`);
  message.retry();
}

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    const base = (env.YOPEDIA_URL ?? "").replace(/\/+$/, "");
    const token = env.YOPEDIA_SERVICE_TOKEN;
    if (!base || !token) {
      // Misconfiguration — retry the whole batch so nothing is lost.
      console.error(
        "task-consumer: missing YOPEDIA_URL or YOPEDIA_SERVICE_TOKEN — retrying batch",
      );
      for (const m of batch.messages) m.retry();
      return;
    }

    // Sequential (not Promise.all): each task triggers an LLM call in the main
    // app; serial processing keeps us within provider rate limits.
    for (const message of batch.messages) {
      await runTask(base, token, message);
    }
  },

  // Autonomous-maintenance cron (Q2). POSTs the scanner, which enqueues
  // `maintain` tasks — or dry-runs (logs only) when AUTONOMOUS_MAINTENANCE isn't
  // "on" in the main app. So this is safe to run on schedule before it's enabled.
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const base = (env.YOPEDIA_URL ?? "").replace(/\/+$/, "");
    const token = env.YOPEDIA_SERVICE_TOKEN;
    if (!base || !token) {
      console.error("task-consumer cron: missing YOPEDIA_URL or YOPEDIA_SERVICE_TOKEN");
      return;
    }
    try {
      const res = await fetch(`${base}/api/tasks/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.text().catch(() => "")).slice(0, 400);
      console.log(`task-consumer cron: scan → ${res.status} ${body}`);
    } catch (err) {
      console.error("task-consumer cron: scan failed", err);
    }
  },

  // Health check (no task triggering — not an open relay).
  async fetch(): Promise<Response> {
    return new Response("yopedia task-consumer ok\n", {
      headers: { "content-type": "text/plain" },
    });
  },
};
