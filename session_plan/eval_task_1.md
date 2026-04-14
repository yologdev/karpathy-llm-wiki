Verdict: PASS
Reason: Both fixes are correctly implemented: `nodeMapRef` is built once on data load and read by reference in `simulate()`, and the per-frame `matchMedia` call is replaced with a reference comparison (`palette === DARK_PALETTE`) against the already-maintained `paletteRef`, which is valid since `getColorPalette()` returns the exact constant objects.
