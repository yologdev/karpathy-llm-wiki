Verdict: PASS
Reason: Both fixes are correctly implemented — `unquoteScalar` now unescapes `\"` only for double-quoted strings (preserving single-quote behavior), and `stripHtml` handles numeric (decimal/hex) and 12 common named HTML5 entities. Tests cover all specified cases and build/lint/test pass.
