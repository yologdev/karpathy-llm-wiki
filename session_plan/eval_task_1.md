Verdict: PASS
Reason: Both fixes implemented correctly — `fromCharCode` replaced with `fromCodePoint` for full Unicode support, and the triplicated link regex in lint.ts is deduplicated into a single `extractWikiLinks` helper used by all three call sites. Tests cover the key edge cases and build/tests pass.
