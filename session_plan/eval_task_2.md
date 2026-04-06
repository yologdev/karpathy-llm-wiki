Verdict: PASS
Reason: Both bugs fixed correctly: `extractSummary` uses `[.!?]\s` and `\n\n` boundaries instead of bare `/[.\n]/`, preventing single-period splits on abbreviations; re-ingest dedup updates existing index entries' title and summary via `findIndex` instead of skipping. Comprehensive tests (38 passing) cover slugify, extractSummary edge cases, and re-ingest update behavior.
