Title: Dark mode toggle with persistence
Files: src/components/ThemeToggle.tsx, src/components/NavHeader.tsx, src/app/layout.tsx, src/app/globals.css
Issue: none

Add a manual dark/light/system theme toggle so users can override their OS
preference. Currently dark mode works via `prefers-color-scheme: dark` in CSS
but there's no user control — if someone prefers dark mode on a light-OS
machine (or vice versa), they're stuck.

## Implementation

### 1. Update Tailwind to use class-based dark mode

In `tailwind.config.ts`, add `darkMode: "class"` so Tailwind's `dark:` variants
respond to a `.dark` class on `<html>` instead of only the OS media query. This
is required for manual toggle support.

### 2. Create ThemeToggle component

Create `src/components/ThemeToggle.tsx`:
- A client component with three states: `light`, `dark`, `system`
- On mount, read preference from `localStorage` key `"theme"`
- Apply the correct class to `document.documentElement`:
  - `light` → remove `dark` class
  - `dark` → add `dark` class
  - `system` → check `window.matchMedia('(prefers-color-scheme: dark)')` and
    add/remove accordingly; also listen for changes to the media query
- Persist choice to `localStorage` on change
- Render as a compact button (sun/moon/monitor icons using unicode or simple SVG)
  that cycles through the three states on click
- Show a tooltip or aria-label indicating current state

### 3. Integrate into NavHeader

Add `<ThemeToggle />` to `src/components/NavHeader.tsx` in the right side of
the nav bar, next to the Settings link. Keep it small and unobtrusive.

### 4. Prevent FOUC (flash of unstyled content)

In `src/app/layout.tsx`, add an inline `<script>` in the `<head>` (before
the body renders) that reads `localStorage.theme` and applies the `dark`
class immediately. This prevents a flash of wrong-theme on page load.

The script should be something like:
```
<script dangerouslySetInnerHTML={{ __html: `...` }} />
```

### 5. Update globals.css

Keep the CSS custom properties but make them respond to `.dark` class instead
of (or in addition to) the media query:
```css
:root { --background: #ffffff; --foreground: #171717; }
.dark { --background: #0a0a0a; --foreground: #ededed; }
```

Keep the media query as a fallback for when JS hasn't loaded yet (progressive
enhancement).

## Constraints

- Touch at most 4 files (ThemeToggle.tsx new, NavHeader.tsx, layout.tsx, globals.css)
- No new dependencies — use plain DOM APIs for theme detection
- Must work with existing `dark:` Tailwind classes throughout the app
- The toggle should be visually clean — a small icon button, not a bulky dropdown

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Manual: toggle should cycle light→dark→system, persist across page reloads,
and correctly apply/remove the `dark` class on `<html>`.
