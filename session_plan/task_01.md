Title: Scaffold Next.js 15 project with TypeScript, Tailwind, and vitest
Files: package.json, tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.mjs, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, vitest.config.ts, src/lib/__tests__/smoke.test.ts
Issue: #1

## Description

Initialize the Next.js 15 project from scratch using pnpm. This is the foundational task — everything else depends on it.

### Steps

1. **Initialize Next.js 15 with App Router + TypeScript + Tailwind:**
   Run `pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-pnpm` or manually create the files if the interactive installer is problematic in CI. The key is to end up with a working Next.js 15 App Router project.

2. **Add vitest for testing:**
   - `pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`
   - Create `vitest.config.ts` with jsdom environment
   - Add `"test": "vitest run"` to package.json scripts

3. **Create a minimal landing page:**
   - `src/app/layout.tsx` — root layout with html/body, basic metadata (title: "LLM Wiki")
   - `src/app/page.tsx` — simple landing page with heading "LLM Wiki" and brief description
   - `src/app/globals.css` — Tailwind directives (@tailwind base/components/utilities)

4. **Create a smoke test:**
   - `src/lib/__tests__/smoke.test.ts` — a simple test that verifies vitest works (e.g., `expect(1 + 1).toBe(2)`)

5. **Verify:**
   ```sh
   pnpm build && pnpm lint && pnpm test
   ```
   All three must pass. The build should produce a working Next.js app. The landing page should render at `/`.

### Notes
- Use Node 20 compatible dependencies
- pnpm 9 is the package manager
- Next.js 15 uses App Router by default
- Make sure `next.config.ts` (not .js) is used for TypeScript config
- eslint config should work with Next.js 15 defaults
- The `.gitignore` already has node_modules/, .next/, .env, .env.local
