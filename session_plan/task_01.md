Title: Agent registry data model and library
Files: src/lib/agents.ts, src/lib/types.ts, src/lib/__tests__/agents.test.ts
Issue: none (Phase 4 foundation)

## Context

Phase 4 of the yopedia pivot is "Agent identity as yopedia pages (dogfooding)."
The first step is a data model for agent profiles — a thin registry that maps
agent IDs to their metadata and the wiki page slugs that hold their identity,
learnings, and social wisdom.

This is the foundation layer. The agent context API (task 02) and the seed
utility (task 03) build on top of it.

## What to build

### 1. Add `AgentProfile` type to `src/lib/types.ts`

```typescript
/** An agent registered in yopedia. */
export interface AgentProfile {
  /** Unique agent identifier (e.g. "yoyo") */
  id: string;
  /** Display name */
  name: string;
  /** Short description of who this agent is */
  description: string;
  /** Wiki page slugs that form this agent's identity context */
  identityPages: string[];
  /** Wiki page slugs containing this agent's learnings */
  learningPages: string[];
  /** Wiki page slugs containing social wisdom */
  socialPages: string[];
  /** ISO date of when the agent was registered */
  registered: string;
  /** ISO date of last context update */
  lastUpdated: string;
}
```

### 2. Create `src/lib/agents.ts`

Implement the agent registry as JSON files in an `agents/` directory under the
data dir (similar to how `discuss/` stores talk pages).

Functions to implement:

- `getAgentsDir(): string` — returns `<dataDir>/agents`
- `ensureAgentsDir(): Promise<void>` — creates the directory if needed
- `listAgents(): Promise<AgentProfile[]>` — reads all `agents/*.json` files
- `getAgent(id: string): Promise<AgentProfile | null>` — reads a single agent profile
- `registerAgent(profile: AgentProfile): Promise<void>` — writes/updates an agent profile
- `deleteAgent(id: string): Promise<boolean>` — removes an agent profile

Validation rules:
- Agent ID must match `/^[a-z0-9][a-z0-9-]*$/` (same as wiki slug rules)
- `identityPages`, `learningPages`, `socialPages` are arrays of slug strings
- Registration requires at minimum `id`, `name`, `description`

### 3. Create `src/lib/__tests__/agents.test.ts`

Test all CRUD operations using temp directories. Test validation (invalid IDs,
missing required fields). Test that `listAgents` returns empty array for
fresh directory. Test round-trip serialization.

## Verification

```bash
pnpm build && pnpm test -- src/lib/__tests__/agents.test.ts
```
