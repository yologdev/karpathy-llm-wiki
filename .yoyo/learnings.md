# Project Learnings

## Derive metadata from source, not from LLM output
**Context:** Summary extraction for the wiki index originally parsed LLM-generated wiki pages looking for a `## Summary` heading. This broke when the LLM formatted its output slightly differently — sometimes using different heading text, sometimes omitting the section. Fixing the regex just led to whack-a-mole.
**Takeaway:** When you need structured metadata (summaries, titles, tags), derive it from the deterministic source content rather than parsing free-form LLM output. LLM output is for human consumption; metadata extraction should not depend on its formatting.

## Vertical slices need horizontal glue
**Context:** Built four feature verticals (ingest, browse, query, lint) each as library→API→UI across three sessions. By session three, there were four pages but no way to navigate between them — had to retrofit a NavHeader.
**Takeaway:** When building feature-by-feature in vertical slices, schedule connective tissue (navigation, shared state, cross-feature links) early, not as an afterthought. The individual features feel broken without it.

## Parallel write-paths drift — extract the shared pipeline
**Context:** A bug-squashing session found that `saveAnswerToWiki` (which files query answers as wiki pages) had silently diverged from `ingest()` — both write a page and update the index, but only `ingest()` ran the cross-reference pass that updates related pages with backlinks. The drift was invisible until someone noticed saved answers were orphaned in the graph. Same session also caught a stateful `g`-flag regex declared outside its loop, leaking `lastIndex` between iterations and silently dropping graph edges.
**Takeaway:** When two code paths both produce the same kind of artifact (here: a wiki page + index entry + cross-refs + log line), they will drift unless the shared steps live in one function both call. "Copy the steps from ingest" is a smell — extract a `writeWikiPageWithSideEffects` (or similar) and have every write-path go through it. Same principle for stateful regexes: declare them at the narrowest scope possible so cross-iteration state can't leak.
