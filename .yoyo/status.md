# Status Report

**Generated:** 2026-06-02  
**Build status:** ✅ PASS — 2,054 tests, 32 API routes, zero type errors

---

## Metrics snapshot

- **Total lines:** ~56,082 (lib: ~11,158, tests: ~28,551, components: ~5,009, hooks: ~1,913, mcp: 2,344)
- **Test files:** 58
- **Test count:** 2,054
- **Wiki pages (schema):** 12 frontmatter fields (title, aliases, confidence, expiry, valid_from, authors, contributors, sources, disputed, supersedes, tags, type)
- **API routes:** 32
- **MCP tools:** 31 (search_wiki, read_page, list_pages, create_page, update_page, update_metadata, delete_page, ingest_url, batch_ingest, ingest_text, ingest_x_mention, query_wiki, save_query_answer, agent_context, seed_agent, list_agents, update_agent, delete_agent, list_contributors, get_contributor, lint_wiki, fix_lint_issue, list_discussions, create_discussion, resolve_discussion, add_comment, reingest, ingest_history, dataview_query, list_revisions, read_revision)
- **Lint checks:** 16 (orphan-page, stale-index, empty-page, missing-crossref, broken-link, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page, duplicate-entity, uncited-claims, unresolved-discussions, disputed-page, supersedes-dangling, incomplete-coverage)

### yopedia Phase Progress

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Schema evolution** | ✅ Complete | Extended frontmatter (confidence, expiry, valid_from, authors, contributors, sources, disputed, supersedes, aliases), type validation/coercion, entity dedup, 16 lint checks with auto-fix, ingest pipeline wiring, SCHEMA.md updated |
| **Phase 2: Talk pages + attribution** | ✅ Complete | Discussion panel UI + API, contributor profiles with trust scores, threaded comments with nested replies, contributor badges on page view |
| **Phase 3: X ingestion loop** | ✅ Complete | Library function + API route + MCP tool (`ingest_x_mention`) complete — GitHub Actions polling workflow blocked on deployment architecture |
| **Phase 4: Agent identity** | ✅ Complete | Agent registry, seed, scoped search, context API, MCP server (31 tools), contributor profiles, agent CRUD — remaining: grow.sh migration, identity content migration |
| **Phase 5: Agent surface research** | ⬜ Not started | Structured claims, fact triples, embeddings experiments |

### Known tech debt

1. **No E2E browser tests** — Unit and integration tests are strong (2,054) but no Playwright/Cypress tests
2. **Contributor trust score** — Simple `edits / (edits + reverts)` ratio; needs validation against real multi-user data
3. **grow.sh still coupled to yoyo-evolve** — Downloads a tarball from a separate repo instead of using the yopedia API it already has
4. **GitHub Actions polling workflow** — Phase 3 X-mention polling (#21) blocked on deployment architecture

---

*This report was generated on 2026-06-02.*
