Title: Update stale status report and refresh metrics
Files: .yoyo/status.md
Issue: none

## Context

The status report (.yoyo/status.md) has several stale or incorrect entries that
create confusion for agents reading it for context:

1. **Test count:** Says 1,582 but actual is 1,605 (+23 since last report)
2. **MCP tools description:** Says "read-only tools" but MCP actually has 7
   tools including write operations (create_page, update_page, seed_agent)
3. **"What shipped" table:** Lists 5 sessions but misses recent work (entity
   dedup, temporal validity, x-mention route, StorageProvider interface)
4. **"Next 5 sessions" section:** Lists "MCP write tools" as priority #1, but
   these are already shipped
5. **Tech debt section:** Lists "MCP write tools" as tech debt, but they exist
6. **Session count:** May be inaccurate

## What to change

Rewrite .yoyo/status.md with accurate current state:
- Update test count to 1,605 (53 test files)
- Fix MCP description to list all 7 tools including write operations
- Update "what shipped" to reflect last 5 actual sessions
- Update "next 5 sessions" with current priorities (StorageProvider adoption,
  grow.sh migration, Phase 5 research, Cloudflare deploy when unblocked)
- Fix tech debt list (remove shipped items, add actual debt)
- Update line counts and metrics from assessment
- Update phase progress table

Keep the same format and structure. Be accurate and honest about what's done vs
what's not.

## Verification

No code changes — just documentation. Check that the file is valid markdown:
```sh
pnpm build  # should still pass (status.md is not imported)
```
