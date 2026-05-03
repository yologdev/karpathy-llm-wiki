Title: Update .yoyo/status.md to reflect current state
Files: .yoyo/status.md
Issue: none

## Description

The status report is stale and misleading:
- Says 1,362 tests — actual is 1,477 tests across 48 test files
- Says Phase 3 is "not started" — but library + route are now merged
- Says Phase 4 is not started — but it's core-complete (agent registry, context API, scoped search)
- Missing the StorageProvider interface and Workers-compat work
- Session count says ~62 when we're now past that

Rewrite `.yoyo/status.md` following the template at the bottom of the current file.
Use accurate numbers from the assessment:

**Key facts to include:**
- Date: 2026-05-03
- Sessions: ~65 (approximate)
- Build: ✅ PASS — 1,477 tests, 26 API routes, zero type errors
- Total lines: ~41,643 (lib + tests + pages + components + hooks)
- 48 test files, 19,807 lines of tests

**What shipped (last 5 sessions):**
- X-mention ingest library + API route (#19, #20)
- StorageProvider interface (#6)
- Replace Node.js-only deps for Workers compat (#13)
- Agent registry, context API, seedAgent (#4, #5)
- Scoped search library + API
- DiscussionPanel decomposition
- Contributor profiles with trust scores
- Growth pipeline decomposition into 5 agents

**Phase progress update:**
- Phase 1: ✅ Complete
- Phase 2: ✅ Complete
- Phase 3: 🟡 Partial (library + route done, workflow blocked on X API)
- Phase 4: ✅ Core complete (agent registry, context API, scoped search)
- Phase 5: ⬜ Not started

**Blockers:** 12 issues blocked on human action (Cloudflare account, X API creds)

**Next priorities:**
1. FilesystemStorageProvider implementation (unblocks migration chain)
2. Phase 4 content migration (yoyo's actual identity → yopedia pages)
3. grow.sh integration with yopedia API

**Tech debt:**
- StorageProvider abstraction exists but has no concrete implementation (dead code)
- 15 lib files still use raw `fs` imports
- No E2E browser tests
- Flat comment threading (no nesting)

### Verification

The file should be valid markdown. No code verification needed for this task —
it's a documentation update. But the agent should run `pnpm build` to confirm
nothing is broken by any file it touches.
