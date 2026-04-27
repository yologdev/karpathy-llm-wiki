Title: Patch security vulnerabilities (next, vitest/vite, postcss)
Files: package.json, pnpm-lock.yaml
Issue: none

## Description

Bump dependencies to patch 6 known vulnerabilities (3 high, 3 moderate):

1. **next**: 15.5.14 → 15.5.15+ (DoS via Server Components — GHSA-q4gf-8mx6-v5v3)
2. **vitest**: 3.2.4 → latest 3.x (pulls vite 7.3.2+ fixing 3 CVEs — GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, path traversal)
3. **postcss**: transitive via tailwindcss — override or bump if needed (XSS — patched in 8.5.10)

Also bump `eslint-config-next` to match the new next version.

### Steps

1. `pnpm update next eslint-config-next` — bump to latest 15.x
2. `pnpm update vitest` — bump to latest 3.x (should pull vite 7.3.2+)
3. Check if postcss is resolved: `pnpm audit` — if still vulnerable, add `pnpm.overrides` in package.json for postcss
4. Verify: `pnpm build && pnpm lint && pnpm test`
5. Verify: `pnpm audit` shows 0 vulnerabilities (or reduced)

### Risks
- Next.js minor version bumps can introduce breaking changes. If build breaks, pin to exact 15.5.15.
- Vitest major version changes could break test config. Stick within 3.x range.
- If any bump causes failures that can't be resolved in 3 attempts, revert.
