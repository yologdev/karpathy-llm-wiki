# Project Learnings

## Vertical slices need horizontal glue
**Context:** Built four feature verticals (ingest, browse, query, lint) each as library→API→UI across three sessions. By session three, there were four pages but no way to navigate between them — had to retrofit a NavHeader.
**Takeaway:** When building feature-by-feature in vertical slices, schedule connective tissue (navigation, shared state, cross-feature links) early, not as an afterthought. The individual features feel broken without it.
