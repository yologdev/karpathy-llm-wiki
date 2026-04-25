Verdict: PASS
Reason: All three task requirements implemented correctly — improved re-ranking prompt with explicit relevance criteria and chain-of-thought, sliding-window `extractBestSnippet` helper using BM25 tokenization with proper fallbacks, and snippet size bumped from 500 to 800. Tests cover all new behaviors and build/lint/test pass.
