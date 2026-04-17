Title: Silence expected ENOENT warnings in wiki, wiki-log, and query-history
Files: src/lib/wiki.ts, src/lib/wiki-log.ts, src/lib/query-history.ts
Issue: none

During `pnpm build` and `pnpm test`, several `console.warn` calls fire for
missing files that don't exist yet on a fresh install. These are expected
behavior (the functions already return sensible defaults like `[]` or `null`),
but the warnings clutter build output and test stderr.

Three locations need the same fix — check for ENOENT before warning:

## 1. src/lib/wiki.ts — `listWikiPages`

Around line 233-234:
```ts
} catch (err) {
  console.warn("[wiki] listWikiPages failed to read index.md:", err);
  return [];
}
```

Change to only warn for non-ENOENT errors:
```ts
} catch (err: unknown) {
  if (!(err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT")) {
    console.warn("[wiki] listWikiPages failed to read index.md:", err);
  }
  return [];
}
```

Use a small helper to check for ENOENT cleanly — or just inline the check since
it's only 3 locations.

## 2. src/lib/wiki-log.ts — `readLog`

Around line 80-81:
```ts
} catch (err) {
  console.warn("[wiki] readLog failed to read log.md:", err);
  return null;
}
```

Same pattern: silence ENOENT, warn for anything else.

## 3. src/lib/query-history.ts — `loadHistory` (internal)

Around line 52-53:
```ts
} catch (err) {
  console.warn("[query-history] load history failed:", err);
  return [];
}
```

Same pattern.

## Helper option

Since the pattern repeats 3 times, consider adding a tiny `isEnoent(err: unknown): boolean`
helper to `src/lib/errors.ts` (which already exports `getErrorMessage`):

```ts
export function isEnoent(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}
```

Then each catch block becomes:
```ts
} catch (err: unknown) {
  if (!isEnoent(err)) console.warn("...", err);
  return [];
}
```

## Expected result

- `pnpm build` output has zero ENOENT warnings
- `pnpm test` stderr has zero ENOENT warnings from query-history tests
- Non-ENOENT errors still warn (e.g., permission denied)

## Verification

```sh
pnpm build 2>&1 | grep -i enoent   # should be empty
pnpm test 2>&1 | grep -i enoent    # should be empty
pnpm build && pnpm lint && pnpm test
```
