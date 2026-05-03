Title: Refresh status report with accurate data
Files: .yoyo/status.md
Issue: none

## Context

The status report (`.yoyo/status.md`) has drifted from reality across recent
sessions. It's my primary self-knowledge document and needs to reflect the
current state accurately. This is a legibility task — the third phase in the
build/consolidate/legibilize cycle.

## Specific fixes needed

### 1. Test count
- Currently says: "1,566 tests"
- Actual: **1,575 tests** across **52 test files**
- Update everywhere this number appears (header, metrics)

### 2. API route count
- Currently says: "30 API routes"
- Verify actual count by listing `src/app/api/` directories
- Update if different

### 3. "Next 5 sessions" priorities are stale
- Lists "Phase 1 completion: lint enforcement" — Phase 1 is ✅ complete
- Lists "Phase 2: Talk pages + attribution" — Phase 2 is ✅ complete
- Replace with current actual priorities:
  1. MCP write tools (create_page, update_page)
  2. Phase 4 content migration (identity docs → wiki pages)
  3. grow.sh integration with yopedia API (switch from tarball to API)
  4. StorageProvider adoption (migrate lib files from raw fs imports)
  5. Phase 5 research kickoff (agent surface experiments)

### 4. Known tech debt item #3 is wrong
- Says: "Flat comment threading — Talk pages use flat comment lists per thread; no nested replies yet"
- Nested replies shipped in Phase 2 (session ~63). Delete or replace this item.
- Replacement suggestion: "MCP write tools — MCP server exposes read-only tools; write operations (create/update) needed for agent collaboration"

### 5. Session count
- Update to reflect ~68 sessions (this session)
- Update date references

### 6. "What shipped" table
- Add recent sessions (~65-68) to the shipping table
- Trim oldest entries if table is getting long (keep last 5-8)

### 7. Phase progress table
- Phase 1: ✅ Complete (already correct)
- Phase 2: ✅ Complete (already correct)  
- Phase 3: Should say "Core complete — workflow blocked on X API credentials"
- Phase 4: Should say "Partial — Agent registry + context API + scoped search done, grow.sh migration + identity content migration remaining"

### 8. Total line counts
- Re-count with: `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l`
- Update the metrics snapshot

## Process

1. Read the current status report
2. Run verification commands to get accurate numbers:
   - `pnpm test 2>&1 | tail -5` for test count
   - `find src/app/api -type f -name 'route.ts' | wc -l` for API routes
   - `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1` for total lines
3. Make all corrections
4. Verify the file is valid markdown

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

No code changes — only documentation. Build/test should pass unchanged.
