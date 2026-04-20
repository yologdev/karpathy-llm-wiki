Title: Accessibility foundations — skip-nav, landmarks, and focus management
Files: src/app/layout.tsx, src/components/NavHeader.tsx, src/app/globals.css
Issue: none

## Problem

The app has minimal accessibility support. Screen reader and keyboard users face:
1. No skip-navigation link — must tab through every nav item on every page
2. No landmark roles — `<main>`, `<nav>`, `<header>` elements aren't used consistently
3. No visible focus indicators on interactive elements beyond browser defaults

## What to Build

### 1. Skip-nav link (`src/app/layout.tsx`)

Add a visually hidden skip-nav link as the very first focusable element in the `<body>`:
```html
<a href="#main-content" className="skip-nav">Skip to main content</a>
```

Add a corresponding `id="main-content"` attribute on the `<main>` element that wraps page content. If there's no `<main>` element in layout.tsx yet, add one.

### 2. Landmark roles (`src/components/NavHeader.tsx`)

- Wrap the navigation in `<nav aria-label="Main navigation">` if not already done
- Ensure the header uses `<header>` element (or `role="banner"`)
- The mobile menu button should have `aria-label="Toggle navigation menu"` (check if it exists)

### 3. Skip-nav CSS (`src/app/globals.css`)

Add `.skip-nav` styles:
```css
.skip-nav {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  z-index: 100;
}
.skip-nav:focus {
  position: fixed;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  padding: 0.75rem 1.5rem;
  background: var(--background);
  color: var(--foreground);
  border: 2px solid currentColor;
  z-index: 9999;
  font-size: 1rem;
}
```

### 4. Focus-visible ring utility

Add to globals.css a `.focus-ring` utility or use Tailwind's `focus-visible:ring-2` pattern. Ensure interactive elements (buttons, links, inputs) have visible focus indicators. Check that Tailwind's default focus-visible styles are not being suppressed.

## Constraints

- Touch at most 3 files: `layout.tsx`, `NavHeader.tsx`, `globals.css`
- Don't refactor existing functionality — additive changes only
- Test by building: the accessibility changes are structural HTML, no runtime logic

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All must pass. Manually verify by grepping for the added elements:
```bash
grep -n "skip-nav\|main-content\|aria-label" src/app/layout.tsx src/components/NavHeader.tsx
```
