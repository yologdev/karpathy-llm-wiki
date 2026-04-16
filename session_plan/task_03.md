Title: Add "Copy as Markdown" button to query result
Files: src/app/query/page.tsx (only)

Issue: none

## Context

After getting an answer on the Query page, users currently have two options: save it as a wiki page, or manually select-all and copy. There's no one-click way to grab the answer (with citations) as portable markdown to paste into a notebook, Slack, an email, etc.

This is a small, high-value UX win that fits the founding-vision philosophy of "your wiki is markdown you can take anywhere": the export button on the wiki side already does this for pages — the query view should match.

## What to build

In `src/app/query/page.tsx`, in the result block (the `{result && (...)}` section, currently around lines 363–410), add a **Copy as Markdown** button next to the existing "Save to Wiki" controls.

The button should:

1. Be visible only when streaming has finished (`!streaming`) and a result exists.
2. Sit alongside the Save controls — same border-top section, same visual weight.
3. On click: build a markdown string of the form:
   ```
   # <question>

   <result.answer>

   ## Sources

   - [[slug-1]]
   - [[slug-2]]
   ```
   (Skip the `## Sources` block entirely if `result.sources` is empty. Use the `[[slug]]` Obsidian wiki-link format to match `src/lib/export.ts` conventions.)
4. Write that string to `navigator.clipboard.writeText(...)`.
5. Show a transient "Copied!" confirmation by swapping the button label for ~2 seconds (use a `useState<"idle" | "copied">` and a `setTimeout` cleared in a `useEffect` cleanup).
6. Gracefully handle the clipboard write failing (older browsers, insecure contexts): catch the rejection, set state to `"error"`, show "Copy failed" for ~2 seconds. Log to console with a clear prefix `[query] copy failed:`.

## Implementation hints

- Add the new state near the existing `saveState`: `const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");`
- Add a `useEffect` to clear the state back to "idle" on a 2s timer when it changes away from "idle". Make sure the cleanup function clears the timer.
- Button styling: match the existing buttons in the page (border, rounded, hover transition). Look at the "Save to Wiki" idle button for the canonical pattern.
- Place the button **before** the save controls in the JSX (left-to-right reading order: copy is the lighter action, save is the commitment).
- The question is in the `question` state variable, but note that on history-load it gets repopulated correctly. Use `question.trim()` as the heading.

## Verification

```sh
pnpm build
pnpm lint
pnpm test
```

All 622 tests must still pass. There are no unit tests for the query UI, so manual reasoning suffices:

1. Confirm `pnpm build` produces no new warnings.
2. Confirm `pnpm lint` is clean — especially no `react-hooks/exhaustive-deps` warnings on the new useEffect.
3. Verify the file grew by no more than ~40 lines (button + state + effect + handler).

## Out of scope

- Do not extract this into its own component. It's small and lives logically with the result.
- Do not add a "copy plain text" variant or a format picker. Markdown only.
- Do not change the Save flow or any other existing behavior.
- Do not depend on or interact with task_01 (wiki-log) or task_02 (sidebar extraction). This task touches **one file** and only the result-block region.
- If task_02 has already moved code around, the result block should still be intact — just merge cleanly around it.
