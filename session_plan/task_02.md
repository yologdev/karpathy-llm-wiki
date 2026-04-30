Title: Keyboard navigation shortcuts with help overlay
Files: src/hooks/useKeyboardShortcuts.ts, src/components/ShortcutsHelp.tsx, src/app/layout.tsx, src/lib/__tests__/keyboard-shortcuts.test.ts
Issue: none

## Description

Add a global keyboard shortcut system for power-user navigation, with a `?` key to show available shortcuts. The global search already responds to Cmd/Ctrl+K — this extends the concept to page navigation and common actions.

### Implementation

**1. `src/hooks/useKeyboardShortcuts.ts`** — Global keyboard shortcut handler:
- A `KeyboardShortcutsProvider` React context component
- Registers a single `keydown` listener on `document`
- Ignores events when focus is in `<input>`, `<textarea>`, `<select>`, or `[contenteditable]` — so typing in forms doesn't trigger navigation
- Supports two-key sequences (vim-style `g` then `i`) with a 1-second timeout between keys
- Built-in shortcuts:
  - `g i` → navigate to `/ingest`
  - `g q` → navigate to `/query`  
  - `g l` → navigate to `/lint`
  - `g b` → navigate to `/wiki` (browse)
  - `g g` → navigate to `/wiki/graph`
  - `g s` → navigate to `/settings`
  - `g r` → navigate to `/raw`
  - `?` → toggle shortcuts help overlay (exposed via context state)
- Exports `useShortcutsHelp()` hook returning `{ showHelp, setShowHelp }`
- Uses `next/navigation` `useRouter()` for client-side navigation

**2. `src/components/ShortcutsHelp.tsx`** — Modal overlay listing shortcuts:
- Conditionally rendered based on `showHelp` from `useShortcutsHelp()`
- Centered modal with backdrop (click backdrop or press `Escape` to close)
- Lists all shortcuts in a clean two-column table (shortcut key | description)
- Includes the existing Cmd/Ctrl+K search shortcut for completeness
- Dark mode compatible with Tailwind classes
- `role="dialog"` and `aria-label="Keyboard shortcuts"` for accessibility
- Focus trap not required (simple info overlay, Escape closes)

**3. Wire into `src/app/layout.tsx`**:
- Wrap `<ToastProvider>` (from task 01) content in `<KeyboardShortcutsProvider>`
- Add `<ShortcutsHelp />` inside the provider
- Order: KeyboardShortcutsProvider > ToastProvider (shortcuts are outermost since they don't depend on toasts)
- Note: if task 01 hasn't been implemented yet, just wrap the existing layout content

**4. `src/lib/__tests__/keyboard-shortcuts.test.ts`** — Unit tests:
- Test that shortcuts are ignored when target is an input element (check `tagName` logic)
- Test two-key sequence timeout (pressing `g` then waiting >1s should reset)
- Test that `?` toggles help state
- Test the route mapping (g+i → /ingest, etc.)
- Since these involve DOM events and React context, test the pure logic functions (isInputElement check, sequence matching) extracted as testable utilities rather than trying to render the full provider

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
