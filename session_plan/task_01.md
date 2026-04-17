Title: Add configurable lint options — selective checks and severity filtering
Files: src/lib/lint.ts, src/lib/types.ts, src/app/api/lint/route.ts, src/app/lint/page.tsx, src/lib/__tests__/lint.test.ts
Issue: none

## Description

The lint system runs all 7 checks unconditionally with no way to select specific checks or filter by severity. This is the #1 code quality priority from status.md: "Structured lint targets (run individual checks, configurable severity)."

### Changes

**1. Add `LintOptions` type to `src/lib/types.ts`:**

```ts
export interface LintOptions {
  /** Which check types to run. Defaults to all if omitted. */
  checks?: LintIssue["type"][];
  /** Minimum severity to include in results. Defaults to "info". */
  minSeverity?: "error" | "warning" | "info";
}
```

**2. Update `lint()` in `src/lib/lint.ts` to accept `LintOptions`:**

- Change signature from `export async function lint(): Promise<LintResult>` to `export async function lint(options?: LintOptions): Promise<LintResult>`
- At the top of lint(), resolve the enabled checks set (default: all 7)
- Guard each check call: `if (enabledChecks.has("orphan-page")) { ... }`
- After collecting all issues, filter by `minSeverity` if specified (severity ordering: error > warning > info)
- This is a backwards-compatible change — calling `lint()` with no args still runs everything

**3. Update `POST /api/lint/route.ts`:**

- Accept optional `checks` and `minSeverity` in the request body
- Pass them through to `lint(options)`
- Validate that `checks` values are valid LintIssue types

**4. Update `src/app/lint/page.tsx`:**

- Add a check-type filter row (toggle buttons for each check type, similar to tag toggles on wiki index)
- Add a severity filter dropdown (All / Error only / Error + Warning)
- Pass selected filters to the API call
- Default state: all checks enabled, all severities shown

**5. Add tests to `src/lib/__tests__/lint.test.ts`:**

- Test that passing `checks: ["orphan-page"]` only returns orphan-page issues
- Test that `minSeverity: "warning"` excludes info-level issues
- Test that `minSeverity: "error"` excludes warning and info
- Test that omitting options runs all checks (backwards compat)

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
