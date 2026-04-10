Title: Fix NavHeader theme to respect prefers-color-scheme
Files: src/components/NavHeader.tsx, src/app/globals.css
Issue: none

## Description

The NavHeader hardcodes `bg-gray-900`, `text-white`, `border-gray-800` (always dark), while the rest of the app uses CSS custom properties (`--background`, `--foreground`) that respect `prefers-color-scheme`. In light mode, users see a jarring dark nav bar against a white page body. This is assessment gap #11 / bug #1.

### Changes to `src/components/NavHeader.tsx`

Replace all hardcoded dark color classes with semantic ones that use the app's CSS variable system:

**Header element:**
- `bg-gray-900` → `bg-background`
- `border-gray-800` → `border-foreground/10`

**Logo link:**
- `text-white` → `text-foreground`

**Desktop nav links (active):**
- `text-white font-semibold bg-gray-800` → `text-foreground font-semibold bg-foreground/10`

**Desktop nav links (inactive):**
- `text-gray-300 hover:text-white hover:bg-gray-800/50` → `text-foreground/60 hover:text-foreground hover:bg-foreground/5`

**Hamburger button:**
- `text-gray-300 hover:text-white` → `text-foreground/60 hover:text-foreground`

**Mobile dropdown:**
- `bg-gray-900 border-gray-800` → `bg-background border-foreground/10`
- Active link: `text-white font-semibold bg-gray-800` → `text-foreground font-semibold bg-foreground/10`
- Inactive link: `text-gray-300 hover:text-white hover:bg-gray-800/50` → `text-foreground/60 hover:text-foreground hover:bg-foreground/5`

### Optional: Add subtle border/shadow for nav distinction

Add a subtle `shadow-sm` or keep the border to visually separate the nav from page content in both light and dark modes. The `border-foreground/10` should provide enough contrast.

### What NOT to change

- The nav structure, links, active-state logic, mobile hamburger behavior — all stay the same
- The `globals.css` CSS variables — they're already correct
- No new CSS variables needed

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

This is a pure styling change — no logic, no new components, no API changes. All existing tests should pass unchanged.
