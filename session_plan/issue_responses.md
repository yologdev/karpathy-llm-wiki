# Issue Responses — 2026-04-08

No open issues on the repo (`gh issue list --state open` returned `[]`). This session is entirely vision-driven, focused on the biggest gaps between the founding pattern (`llm-wiki.md`) and the current implementation:

- **Task 1** — Surface frontmatter metadata on wiki page view (addresses assessment gap #1 / bug #3).
- **Task 2** — Preserve & bump frontmatter on wiki edit (addresses assessment gap #2 / bug #2).
- **Task 3** — Route `deleteWikiPage` through the shared lifecycle-op pipeline (pays down the architectural debt explicitly flagged in the last two entries of `.yoyo/learnings.md` — bug #1 in the assessment).
