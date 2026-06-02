# yopedia Identity, Auth & Contribution — Design

Status: **proposed** (2026-06-02). Supersedes the "contribute via git" model in
[yopedia-concept.md](yopedia-concept.md) for how writes actually happen.

## Why this redesign

The concept assumed contributions flow through **git** (attributed commits,
review-before-merge, repo permissions as the auth layer). That doesn't fit the
product:

- Writing via git means committing **raw markdown**, which **bypasses the
  ingest synthesis** (fetch → LLM synthesize → embed) — the core value of
  yopedia.
- The deployed app stores pages in **R2** and writes via the **HTTP API**;
  `wiki/` is gitignored. There is no git write path.

So contribution stays **API-based, through the ingest pipeline**. Git gave us
**authentication, attribution, and review** for free; dropping it means we
build those explicitly. This doc defines that.

It also fixes two live problems: every page is currently authored by the
hardcoded `system`, and the HTTP write endpoints are **unauthenticated**
(anyone can ingest/edit/delete — see the write-token stopgap).

## The three identities

The central clarification: **yoyo is a shared service, not a per-user install.**

| # | Identity | What it is | When |
|---|----------|------------|------|
| 1 | **User (principal)** | A human, authenticated via SSO. Owns the content they bring in; accountable party. | Now |
| 2 | **yoyo — service agent** | One shared ingestion/knowledge engine + one base identity. Acts **on behalf of** users. Triggered in-app, by long-running tasks, or via `@yoyoevolve` on X. | Now (seeded once) |
| 3 | **Per-user yoyo identity** | A *personalized* yoyo that knows a specific user (persona + memory). Loaded/provisioned via API when a user starts their yoyo chatbot. | Future |

## Authentication

- **Humans → Clerk (SSO/OIDC).** Login yields a *principal*. Clerk is chosen
  because it also provides **billing/subscriptions**, which gates the paid
  "private content" feature (below) without a second vendor. Verify Clerk's
  middleware works under OpenNext/Workers early in the build.
- **yoyo (service) → system credential.** Authenticates to the API as itself and
  always stamps *on whose behalf* it is acting.
- **Third-party agents (future) → scoped API keys / service tokens**, each owned
  by a principal.
- **Principals are individuals only** this version — no orgs/teams (maybe later).

## Authorization & access

- **Reads:** all **public** content is readable by anyone (the observer surface),
  plus the requester's own **private** pages. The read/query/search path filters
  out private pages not owned by the requester. Reuses the existing `?scope=…`
  mechanism for owner-scoped views.
- **Writes:** require an authenticated principal — either the user directly
  (manual ingest) or **yoyo on behalf of an authenticated principal** (mediated).
  There is no anonymous write path. This closes the open-write hole.

## Visibility & monetization

- **Default visibility is `public`.** Ingested content joins the shared commons
  (attributed by `owner`), readable by everyone. This is the free tier.
- **`private` is a paid feature.** A page may be `visibility: private` only if
  its `owner` has an active paid plan (entitlement checked via Clerk billing).
  Private pages are visible only to their owner.
- **No data partitioning needed.** Public and private content share one store
  (R2 + Vectorize); a `visibility` field plus an `owner` check on reads is the
  only gate. Search/vector results must honor `visibility` + `owner`.
- Frontmatter gains: `visibility: public | private` (default `public`).

## Content ownership & attribution

Two separate fields, decided model: **actors-only contributors + `owner`.**

- **`owner`** — the principal the content belongs to / who's accountable.
  **Always the user**, in every case.
- **`authors` / `contributors[]`** — the **acting identities only** (who actually
  did the work). The **user** when manual, **yoyo** when mediated. Grows as
  actors edit over time. The user is **not** double-listed here when yoyo acts —
  the `owner` field carries that link.
- **`sources[].triggered_by`** — always traces back to the user (even when yoyo
  authored).

This replaces the hardcoded `authors: ["system"]`.

| Case | `owner` | `authors`/actor | `triggered_by` |
|------|---------|-----------------|----------------|
| User ingests manually (logged in, pastes URL/text) | `alice` | `alice` | `alice` |
| yoyo ingests for user (X mention, long task, "research X") | `alice` | `yoyo` | `alice` (or X handle) |

Example frontmatter (yoyo-mediated):

```yaml
owner: alice
visibility: public        # default; `private` requires owner on a paid plan
authors: [yoyo]
contributors: [yoyo]      # actors only; alice is the owner, not re-listed here
sources:
  - type: x-mention
    url: https://x.com/<user>/status/<id>
    triggered_by: alice
```

## Ingestion triggers (all yoyo-mediated except manual)

1. **Manual (in-app)** — a logged-in user pastes a URL/text → ingested → page
   `owner: user`, `authors: [user]`.
2. **Long-running task** — queued ingest job run by yoyo → `owner: user`,
   `authors: [yoyo]`.
3. **X / Twitter** — user tweets `@yoyoevolve <url>` → yoyo ingests →
   `triggered_by: <x-handle>`. The handle is mapped to a principal if the user
   linked their X account during onboarding; otherwise a provisional identity.

## Knowledge sharing / query

"yoyo shares knowledge based on your content" = the query/answer surface
**scoped to the user** (their content + shared/public pages). The shared yoyo
answers from the user's scope. **No per-user yoyo identity is required for
this** — it is pure scoping.

## Seed agent

Manual seeding goes away.

- **Base yoyo identity** (personality + learnings as yopedia pages): seeded
  **once at system bootstrap** (automatable in a deploy step). Not per-user, not
  per-session.
- **Per-user yoyo identities** (future): **auto-provisioned / loaded via API**
  the first time a user starts their yoyo chatbot — via
  `GET /api/agents/:id/context`, inheriting the base yoyo plus what it has
  learned about that user. `seed_agent` becomes an **internal API primitive**,
  not a human command.

## Trust (future)

Trust accrues to the **actor** (whoever did the work — user or yoyo), based on
revert/contradiction rates and external citation, used to weight conflicting
contributions. Because attribution is actor-based, a bad yoyo ingest dings
yoyo's score while still resolving to the owner who triggered it.

## Phasing

**Phase 1 (now)**
- Clerk SSO login → principals (individuals)
- Content ownership + `visibility` field (default `public`) + scoped/visibility-
  aware reads
- All writes authenticated (manual by user, or yoyo on behalf of a principal) —
  closes the unauthenticated-write hole
- Real attribution: `owner` + actor `authors` (retire `system`)
- X-handle linking for the `@yoyoevolve` loop
- Base yoyo seeded once at bootstrap

**Phase 1.5 — paid private content**
- Clerk billing/subscription; `visibility: private` gated on an active plan;
  read/search enforcement of private ownership

**Phase 2 (later)**
- Per-user yoyo identities, auto-provisioned via the agent-context API
- Personalized yoyo chatbot (persona + per-user memory)
- Trust scores across contributors
- Orgs/teams as principals

## Reuse (not greenfield)

- **Agent registry** (`AgentProfile`, `agents/<id>.json`, seed/list/get) →
  the identity store; add `owner` + credentials.
- **Scoped search** (`?scope=agent:yoyo`) → per-identity views.
- **`triggeredBy`** on ingest → set to the principal instead of going unused.
- **`isReadOnly()`** → evolve into the write-auth guard.

## Decisions

- **SSO provider:** ✅ **Clerk** (also provides billing for paid private content).
- **Default visibility:** ✅ **public by default**; `private` is a paid feature.
  → No per-owner data partitioning; one store + `visibility`/`owner` filtering.
- **Org/team principals:** ✅ **individuals only** this version (orgs later).

### Still to confirm during build
- Clerk middleware compatibility under OpenNext/Workers (smoke-test early).
- Entitlement check shape for `private` (Clerk billing plan → allow-private).
- Read enforcement in **Vectorize/search** so private pages never leak into
  another user's results.
