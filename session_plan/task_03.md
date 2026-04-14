Title: Fix citations.ts O(n) lookup, lint page constant hoisting, and setTimeout cleanup
Files: src/lib/citations.ts, src/app/lint/page.tsx

Issue: none

## Problem 1: citations.ts O(n) lookup

`src/lib/citations.ts:15` — `availableSlugs.includes(slug)` runs inside a `while` loop over regex matches. For a wiki with N pages and M citations, this is O(N*M). Convert `availableSlugs` to a `Set` at the top of the function for O(1) lookups.

### Fix

```
const slugSet = new Set(availableSlugs);
// ...
if (slugSet.has(slug)) {
```

## Problem 2: lint/page.tsx — constants reconstructed per render per item

`src/app/lint/page.tsx:283` — `fixableTypes` Set and `fixLabel` Record are defined **inside** a `.map()` callback, meaning they get recreated for every list item on every render. These are static data.

### Fix

Hoist `fixableTypes` and `fixLabel` to **module scope** (outside the component), since they contain only string constants with no dependency on props/state.

## Problem 3: lint/page.tsx — setTimeout cleanup on unmount

Lines 151, 180, 193 — Three `setTimeout` calls for auto-dismissing fix messages are never cleaned up. If the component unmounts before the timeout fires, the callback tries to set state on an unmounted component.

### Fix

Store timeout IDs in a `useRef<NodeJS.Timeout[]>` and clear them in a `useEffect` cleanup. Alternatively, use a single ref and clear-on-set pattern. The simplest approach:
- Store each timeout ID in a ref
- In a `useEffect(() => { return () => { clearTimeout(ref.current); }; }, [])` cleanup

Since there are 3 independent setTimeout calls for different message states, use a ref array or individual refs. The cleanest fix: wrap each setTimeout in a helper that auto-tracks the timeout ref, and clear all on unmount via a cleanup effect.

Verify: `pnpm build && pnpm lint && pnpm test`
