Title: Add persistent navigation header across all pages
Files: src/components/NavHeader.tsx, src/app/layout.tsx, src/app/page.tsx
Issue: none

## Description

Currently every page has ad-hoc back links but no consistent navigation. Users have to rely on browser back or manually edit URLs. Add a shared navigation header to all pages.

### What to build

**`src/components/NavHeader.tsx`** — A shared navigation component:
- Logo/title "LLM Wiki" linking to `/`
- Navigation links: Browse (`/wiki`), Ingest (`/ingest`), Query (`/query`), Lint (`/lint`)
- Highlight the active route (use `usePathname()` from `next/navigation`)
- Responsive: horizontal nav on desktop, stays compact on mobile
- Dark theme consistent with the existing Tailwind styling
- Mark it `"use client"` since it uses `usePathname()`

**`src/app/layout.tsx`** — Import and render `<NavHeader />` above `{children}` in the body. Keep the existing layout structure (html, body with font classes, etc.)

**`src/app/page.tsx`** — Remove redundant navigation links from the home page since NavHeader now provides them. Simplify the home page to be a welcome/dashboard view. Keep the project description and value proposition, but remove the manual link cards that duplicate the nav.

### Style guidelines
- Sticky/fixed top nav with `bg-gray-900` or similar dark background
- Nav links: `text-gray-300 hover:text-white`, active link gets `text-white font-semibold` or an underline
- Compact height (h-14 or similar)
- Add appropriate body padding-top to account for fixed header

### Verification
```
pnpm build && pnpm lint && pnpm test
```
