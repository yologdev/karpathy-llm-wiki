Title: Docker deployment — Dockerfile, compose, and self-hosting guide
Files: Dockerfile, .dockerignore, docker-compose.yml, DEPLOY.md, next.config.ts
Issue: none

## Description

The #1 adoption friction is that users must clone the repo and have Node.js + pnpm
installed to try the app. Add a complete Docker deployment story so users can run
with a single `docker compose up`.

### Changes

1. **next.config.ts** — Add `output: "standalone"` to enable Next.js standalone build
   (produces a self-contained Node.js server without needing `node_modules`).

2. **Dockerfile** — Multi-stage build:
   - Stage 1 (`deps`): `node:22-alpine`, install pnpm, copy `package.json` + `pnpm-lock.yaml`, run `pnpm install --frozen-lockfile`.
   - Stage 2 (`build`): Copy source, run `pnpm build`. The standalone output goes to `.next/standalone`.
   - Stage 3 (`runner`): `node:22-alpine`, copy standalone output + static files + public dir. Set `HOSTNAME=0.0.0.0`, expose port 3000, `CMD ["node", "server.js"]`.
   - Mount volumes for `raw/` and `wiki/` so data persists outside the container.
   - Accept LLM provider env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).

3. **.dockerignore** — Exclude `node_modules`, `.next`, `.git`, `raw/`, `wiki/`,
   `.yoyo/`, `session_plan/`, `*.md` (except source files needed for build).

4. **docker-compose.yml** — Single service definition:
   ```yaml
   services:
     wiki:
       build: .
       ports: ["3000:3000"]
       volumes:
         - wiki-data:/app/wiki
         - raw-data:/app/raw
       env_file: .env
   volumes:
     wiki-data:
     raw-data:
   ```

5. **DEPLOY.md** — Self-hosting guide covering:
   - Prerequisites (Docker + Docker Compose)
   - Quick start: create `.env` with API key, `docker compose up`
   - Environment variables reference (all supported providers)
   - Volume mounts explanation
   - Building from source alternative (Node.js + pnpm)
   - Updating to new versions

### Verification

```sh
pnpm build && pnpm lint && pnpm test
docker build -t llm-wiki-test .  # verify Docker build succeeds
```

Note: The Docker build test may not be possible in CI, so at minimum verify
that `next.config.ts` change doesn't break `pnpm build`.
