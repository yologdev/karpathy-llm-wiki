Title: Replace bare catch blocks with typed error guards
Files: src/lib/fetch.ts, src/lib/revisions.ts, src/lib/search.ts, src/lib/wiki.ts
Issue: none

There are 6 bare `catch {}` blocks in lib code that silently swallow ALL errors, not just the expected ones (ENOENT, invalid URL). If an unexpected error occurs (permissions, disk full, corrupted data), it gets silently eaten with no logging. Each block has a comment explaining the *expected* case, but the code doesn't verify the error matches that expectation.

**Pattern to apply:** Replace `catch {}` with `catch (err)` and add a guard that only silences the expected error, logging unexpected ones. Use the existing `isEnoent` helper from `src/lib/errors.ts` where appropriate.

### `src/lib/fetch.ts` (line ~579)
```
// Current: catch {} — "Not a valid URL"
// Fix: catch (err) — only silence TypeError from URL constructor
} catch (err) {
  if (!(err instanceof TypeError)) {
    console.warn("[fetch] unexpected error parsing URL:", err);
  }
  urlPath = rawUrl;
}
```

### `src/lib/revisions.ts` (4 blocks, lines ~88, ~111, ~134, ~150)
All are filesystem operations where ENOENT is expected:
- Line ~88: `readdir` on missing dir → use `isEnoent(err)` guard
- Line ~111: `stat` on disappeared file → use `isEnoent(err)` guard
- Line ~134: `readFile` on missing revision → use `isEnoent(err)` guard  
- Line ~150: `rm` on already-gone dir → use `isEnoent(err)` guard

### `src/lib/search.ts` (line ~425)
Filesystem `readFile` where ENOENT is expected:
- Use `isEnoent(err)` guard, log unexpected errors

### `src/lib/wiki.ts` (line ~212)
Filesystem `readFile` before first write:
- Use `isEnoent(err)` guard, log unexpected errors

**Import `isEnoent` from `./errors`** in `revisions.ts`, `search.ts`, and `wiki.ts` (check if already imported).

**Do not change behavior for expected errors** — only add logging for unexpected ones. The fallback paths (return `[]`, `continue`, `null`, etc.) stay the same.

**Verification:** `pnpm build && pnpm lint && pnpm test`
