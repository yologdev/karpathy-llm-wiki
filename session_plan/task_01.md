Title: Add POST /api/agents/seed route for agent self-registration with content
Files: src/app/api/agents/seed/route.ts, src/lib/__tests__/seed-route.test.ts
Issue: none (Phase 4 infrastructure — assessment gap #1)

## Context

The `seedAgent()` library function (src/lib/agents.ts) creates wiki pages for an
agent and registers the agent profile, but there's no HTTP endpoint to invoke it.
The only way to seed an agent is to call the function directly from code. This
means the growth pipeline (grow.sh) can't seed yoyo into yopedia over the API —
which is exactly what Phase 4 of YOYO.md requires.

## What to build

**POST /api/agents/seed** — accepts a JSON body with agent metadata and content
sections, calls `seedAgent()`, returns the registered profile.

### Request body schema

```json
{
  "id": "yoyo",
  "name": "yoyo",
  "description": "A self-evolving coding agent growing up in public",
  "sections": [
    {
      "slug": "yoyo-identity",
      "title": "yoyo — Identity",
      "type": "identity",
      "content": "I am yoyo, an AI coding agent..."
    },
    {
      "slug": "yoyo-learnings",
      "title": "yoyo — Learnings",
      "type": "learnings",
      "content": "## Recent Lessons..."
    },
    {
      "slug": "yoyo-social-wisdom",
      "title": "yoyo — Social Wisdom",
      "type": "social",
      "content": "## Recent Insights..."
    }
  ]
}
```

### Response

- **201** on success: `{ agent: AgentProfile }` — the full registered profile
  with identityPages, learningPages, socialPages populated
- **400** if required fields missing (id, name, description, sections)
- **400** if sections array is empty or has invalid entries (each needs slug, title, type, content)
- **400** if section type is not one of: "identity", "learnings", "social"
- **500** for internal errors

### Implementation notes

1. Create `src/app/api/agents/seed/route.ts`
2. Import `seedAgent` from `@/lib/agents`
3. Validate the request body manually (check id, name, description, sections array)
4. Validate each section has slug, title, type (one of identity/learnings/social), content
5. Call `seedAgent({ id, name, description, sections })` — this already handles
   writing wiki pages, creating frontmatter, and registering the agent
6. Return the profile with 201 status
7. Unlike POST /api/agents (which rejects existing agents with 409), this route
   should be **idempotent** — re-seeding an existing agent updates its pages
   (seedAgent already handles this via its existing-page-preservation logic)

### Tests

Create `src/lib/__tests__/seed-route.test.ts` with tests for:
- Successful seed returns 201 with agent profile
- Missing id returns 400
- Missing name returns 400
- Missing sections returns 400
- Empty sections array returns 400
- Invalid section type returns 400
- Section missing required field returns 400

Since this is an API route test, test the validation logic. The actual seedAgent
function is already well-tested (689 lines of tests in agents.test.ts).

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
