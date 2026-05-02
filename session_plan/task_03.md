Title: Phase 2 — talk page API routes

Files: src/app/api/wiki/[slug]/discuss/route.ts, src/app/api/wiki/[slug]/discuss/[threadIndex]/route.ts, src/app/api/wiki/[slug]/discuss/[threadIndex]/comments/route.ts

Issue: none

## Context

Task 02 built the talk page data layer (`src/lib/talk.ts`). This task exposes it
via API routes so the frontend can create threads, list discussions, add comments,
and resolve threads. Follows the same patterns as the existing wiki API routes.

## What to build

### 1. Thread list + create: `src/app/api/wiki/[slug]/discuss/route.ts`

**GET** `/api/wiki/:slug/discuss`
- Calls `listThreads(slug)` from talk.ts
- Returns `{ threads: TalkThread[] }`
- Returns empty array if no discussions exist

**POST** `/api/wiki/:slug/discuss`
- Body: `{ title: string, author: string, body: string }`
- Validates all three fields are non-empty strings
- Calls `createThread(slug, title, author, body)`
- Returns `{ thread: TalkThread }` with status 201
- Returns 400 if validation fails

### 2. Thread detail + resolve: `src/app/api/wiki/[slug]/discuss/[threadIndex]/route.ts`

**GET** `/api/wiki/:slug/discuss/:threadIndex`
- Calls `getThread(slug, parseInt(threadIndex))`
- Returns `{ thread: TalkThread }`
- Returns 404 if thread not found

**PATCH** `/api/wiki/:slug/discuss/:threadIndex`
- Body: `{ status: "resolved" | "wontfix" }`
- Validates status is one of the allowed values
- Calls `resolveThread(slug, parseInt(threadIndex), status)`
- Returns `{ thread: TalkThread }`
- Returns 400 if invalid status, 404 if thread not found

### 3. Add comment: `src/app/api/wiki/[slug]/discuss/[threadIndex]/comments/route.ts`

**POST** `/api/wiki/:slug/discuss/:threadIndex/comments`
- Body: `{ author: string, body: string, parentId?: string }`
- Validates author and body are non-empty
- Calls `addComment(slug, parseInt(threadIndex), author, body, parentId)`
- Returns `{ comment: TalkComment }` with status 201
- Returns 400 if validation fails, 404 if thread not found

### 4. Error handling

Follow the same pattern as existing routes:
- Wrap in try/catch
- Use `logger.error()` for failures
- Return `{ error: string }` with appropriate HTTP status
- Use `getErrorMessage()` from errors.ts for safe error serialization

### 5. No tests for API routes

API route testing in this project is done through integration tests and manual
verification. The data layer tests in task_02 cover the core logic. These routes
are thin wiring — input validation + function call + JSON response.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The routes must compile cleanly. Existing tests must continue to pass.
Build verification is the main check for API routes.
