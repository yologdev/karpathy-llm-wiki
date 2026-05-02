Verdict: PASS
Reason: ContributorBadge correctly wraps handle text in an `<a>` linking to `/wiki/contributors/${encodeURIComponent(handle)}` with hover underline, trust dot stays outside the link. Contributors test file has 10 passing tests covering all required scenarios (zeroed profile, revision counting, empty list, sort order, trust score heuristic). Both build and tests pass.
