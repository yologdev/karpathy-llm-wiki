/**
 * Bounded-concurrency parallel map.
 *
 * Keeps the parallelism win on large wikis (reads/writes fan out instead of
 * running serially) WITHOUT firing thousands of simultaneous R2 subrequests —
 * which would blow the Workers subrequest budget and starve the connection
 * pool. Use it anywhere a `for (… of …) await` loop reads/writes per item.
 */

/**
 * Default cap on concurrent R2 reads/writes for a fan-out over pages. Matches
 * `lifecycle.ts`'s independent `LIFECYCLE_CONCURRENCY` (kept separate so the two
 * fan-out classes can be tuned apart); keep them in mind together if you retune.
 */
export const READ_CONCURRENCY = 12;

/**
 * Map over `items` running at most `limit` calls of `fn` at once. The result
 * array is order-preserving (index i holds `fn(items[i])`), so callers can zip
 * it back against the input. A `fn` that rejects rejects the whole call — wrap
 * per-item work in try/catch if partial failure should be tolerated.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
