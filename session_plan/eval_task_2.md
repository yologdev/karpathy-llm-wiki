Verdict: PASS
Reason: Pure refactor correctly extracts BatchItemRow (~56 lines) and BatchProgressBar (~39 lines) with identical markup, exports BatchItem interface from BatchItemRow, keeps all state in BatchIngestForm (now 258 lines), and build+tests pass.
