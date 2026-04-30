Title: Toast notification system
Files: src/hooks/useToast.ts, src/components/ToastContainer.tsx, src/app/layout.tsx, src/components/WikiIndexClient.tsx, src/lib/__tests__/toast.test.ts
Issue: none

## Description

Build a lightweight toast notification system to replace inline success/error feedback and the one remaining `window.alert()` call. This is the biggest UX gap — currently success/error feedback is either invisible (state resets) or blocking (`alert()`).

### Implementation

**1. `src/hooks/useToast.ts`** — A React context + hook for toast notifications:
- `ToastProvider` context that wraps the app
- `useToast()` hook returning `{ addToast, toasts }`
- `addToast(message: string, variant: 'success' | 'error' | 'info' | 'warning')` 
- Each toast has an `id` (incremented counter), `message`, `variant`, and auto-dismisses after 4 seconds
- `removeToast(id)` for manual dismiss
- Maximum 5 visible toasts (oldest evicted when exceeded)
- Export `ToastProvider` and `useToast`

**2. `src/components/ToastContainer.tsx`** — Renders active toasts:
- Fixed position bottom-right (`fixed bottom-4 right-4 z-50`)
- Uses same color scheme as `Alert.tsx` variants for consistency
- Animated entrance (translate-y + opacity via Tailwind transitions)
- Close button on each toast with aria-label
- `role="status"` and `aria-live="polite"` for screen readers

**3. Wire into `src/app/layout.tsx`**:
- Wrap the app body content in `<ToastProvider>`
- Add `<ToastContainer />` inside the provider

**4. Replace `window.alert()` in `src/components/WikiIndexClient.tsx`**:
- Import `useToast` and replace the `alert()` call on export failure with `addToast(message, 'error')`
- Add success toast for successful export

**5. `src/lib/__tests__/toast.test.ts`** — Tests for the hook:
- Test that `addToast` adds a toast with correct properties
- Test that auto-dismiss removes toast after timeout (use `vi.useFakeTimers`)
- Test maximum toast limit (adding 6 toasts evicts the oldest)
- Test `removeToast` removes specific toast
- These tests can use `renderHook` from `@testing-library/react` — check if it's available, if not test the reducer/state logic directly

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
