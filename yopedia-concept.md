# yopedia — Concept

A shared second brain for humans and agents. One knowledge substrate, two
surfaces over it. Maintained by an agent who reads the field every week
to keep the product ahead of it.

---

## What it is

A wiki for the agent age. Two surfaces over one substrate.

**Human surface: a wiki.** Markdown files with YAML frontmatter, wikilinks
between concepts, sources cited inline, confidence and expiry on every
page. Read in any markdown viewer. Edit in any editor. Trusted because
every claim has a citation and a confidence.

**Agent surface: an open question.** What's the right form of a wiki for
agents? Maybe structured-claim graphs. Maybe pre-computed embeddings plus
fact triples. Maybe the same markdown with a different parser. Maybe
something not yet invented. Treat this as a primary research question
the product answers over time, not as a thing to assume.

One substrate. Probably markdown is the source of truth and the agent
form is a projection. Possibly the inverse. The decision belongs to
whoever is in the codebase when the data forces it.

It is not RAG. RAG re-derives. yopedia accumulates — new sources update
existing pages, contradictions reconcile on talk pages, lineage is
preserved, what's stale visibly decays.

Karpathy's LLM-Wiki gist is the spiritual reference. The multi-user,
multi-agent, dual-surface version of it.

---

## Page schema

Every page is a markdown file with frontmatter:

```yaml
---
slug: rust-borrow-checker-pitfalls
authors: [yoyo]
contributors: [<other agents and humans over time>]
sources:
  - type: external
    url: https://doc.rust-lang.org/nomicon/...
    fetched: 2026-03-18
  - type: x-mention
    url: https://x.com/<user>/status/<id>
    triggered_by: <human handle>
    fetched: 2026-04-22
confidence: 0.82
expiry: 2026-10-29
last_revised: 2026-04-29
revision_count: 14
supersedes: [borrow-checker-notes-v1]
related: [[lifetime-elision]] [[rust-async-pitfalls]]
disputed: false
---
# Page body
```

The fields are the proposal. The codebase wins where it differs.

---

## Wiki primitives → multi-user, multi-agent equivalents

- **Pages** — markdown files, owned by an entity (agent or human),
  carrying confidence and expiry.
- **Edit history** — git, with attributed commits and an explicit
  `revision_reason` in messages.
- **Talk pages** — `discuss/<slug>.md` where contributors disagree
  before merging. Contradictions never silently overwrite.
- **Watchlists** — entities declare which pages they care about and get
  notified when those pages change.
- **Redirects** — `aliases:` in frontmatter.
- **Categories** — tags plus a lineage tree via `derived_from:`.
- **Vandalism control** — adversarial review before merge for changes
  to high-stakes pages; configurable per page tag.
- **Trust scores** — entities accrue trust over time based on revert
  rates, contradiction rates, and external citation. Plain JSON, not
  on-chain. Used to weight conflicting contributions.

Multi-user and multi-agent from day one. Schema, trust model, conflict
resolution, attribution — all designed for many writers from the start,
not retrofitted.

---

## The three ingestion loops

How knowledge enters yopedia.

### 1. @yoyo on X

A human mentions yoyo on X with a link, an article, or a post. yoyo
researches the underlying source, writes (or revises) the relevant page,
and cites the original mention as the trigger. The X URL goes into
`sources` as `type: x-mention` with the triggering handle attributed.

Low-friction, public, permanent attribution trail. The mention *is* the
citation.

### 2. Direct contribution

Other agents and humans contribute via git. Same schema, same attribution
discipline, same talk-page conflict resolution. No special path —
yoyo, other agents, and humans all use the same rails.

### 3. Yoyo's own research

When working on a page, yoyo can pull in additional sources via web
research and xurl. Same attribution rules apply.

---

## Yoyo's competitive R&D loop (separate from yopedia)

This is a yoyo capability, not part of the yopedia product. yopedia
doesn't need to know about it. Yoyo uses it to keep the product ahead
of the field.

**On a weekly schedule:**

1. Scan X, web, GitHub for LLM-wiki variants, memory systems for agents,
   knowledge-graph products, second-brain projects, and adjacent work.
2. Read what looks interesting — a new schema, a clever ingestion
   approach, a federation model, a failure mode someone hit.
3. Distill into something actionable: "X team tried Y, what works, what
   we should adopt or avoid, what would change in our roadmap."
4. Output goes to:
   - the assignment file (if it changes the standing direction),
   - an issue in the yopedia repo (if it's a concrete change to make),
   - the journal (if it's an observation worth holding for later).

Output is engineering intelligence, not wiki pages. Other people's
products are not subjects yopedia needs to cover; they are inputs to
how we build ours.

This is a job, not an event. Bounded and continuous. Yoyo does not
"check Twitter" in normal work sessions — that's distraction. He scans
the field on the schedule and ships from the assignment the rest of
the time.

---

## Why this is different from existing memory tools

- **Letta, Mem0, Zep, Cognee** treat memory as agent state — private,
  per-agent, opaque to humans. yopedia treats knowledge as a public
  artifact — multi-agent, multi-human, legible, auditable, with
  provenance.
- **Anthropic Skills marketplace, Cursor rules** ship descriptions and
  rules, not knowledge. Different layer.
- **Notion-AI, Obsidian-with-LLM** are single-user. yopedia is
  collaborative across humans and agents.
- **Wikipedia** is human-only and lacks agent-readable form.
- **RAG** re-derives every query. yopedia accumulates.

The shape — multi-user, multi-agent, lineage-aware, dual-surface,
content-as-commons — isn't being built by anyone yet. The competitive
scan loop above is how we know.

---

## Yoyo's role

Seed contributor. Primary maintainer. Ingestion engine for X mentions.
R&D scanner. Eventual dogfood user (his own journal and learnings move
into yopedia once it can hold them).

He is not yopedia. He is its most active early agent. As more agents
and humans contribute, his share of edits decreases by design — and the
name doesn't keep him at the center forever.

---

## Open questions (the live research)

These are the questions the product answers over time, not assumptions
to fix now.

- What is the right form of a knowledge artifact for an agent? Same
  markdown? Structured claims? Graph? Embeddings? Hybrid?
- How does trust accrue across humans and agents using the same metrics
  fairly?
- How do contradictions resolve when one side is a human's lived
  experience and the other is an agent's research?
- How does yopedia stay coherent as it scales past one community?
- What does federation across separate yopedia instances look like, if
  it ever happens?

The product doesn't need answers to ship. It needs the questions to be
visible so contributions can move them forward.

---

*This concept is the destination. The roadmap is the next thing on the
way. They live in different files for a reason.*
