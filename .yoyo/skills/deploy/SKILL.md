---
name: deploy
description: Deploy yopedia to Cloudflare using wrangler CLI
tools: [bash, read_file, write_file, edit_file]
---

# Deploy

You can provision and deploy yopedia infrastructure on Cloudflare using the
wrangler CLI. All commands run via `npx wrangler` (no global install needed).

## Cloudflare Services

| Service | Purpose | Provisioning |
|---------|---------|-------------|
| **Pages** | Frontend + Workers (Nitro) | `wrangler pages project create yopedia` |
| **R2** | Markdown file storage (source of truth) | `wrangler r2 bucket create yopedia-wiki` |
| **KV** | Derived indexes (search, metadata cache) | `wrangler kv namespace create SEARCH_INDEX` |
| **Vectorize** | Semantic search embeddings | `wrangler vectorize create yopedia-embeddings --dimensions 1536 --metric cosine` |

## Key Principle

**Markdown files in R2 are the source of truth.** KV and Vectorize hold derived
projections that can be rebuilt from the markdown at any time. Never treat a
database as canonical — R2 IS the filesystem.

## wrangler.toml

The deployment config lives at the project root:

```toml
name = "yopedia"
compatibility_date = "2025-01-01"
pages_build_output_dir = ".output/public"

[[r2_buckets]]
binding = "R2"
bucket_name = "yopedia-wiki"

[[kv_namespaces]]
binding = "KV"
id = "<namespace-id>"

[[vectorize]]
binding = "VECTORIZE"
index_name = "yopedia-embeddings"
```

After creating KV namespace, `wrangler` prints the namespace ID. Update
`wrangler.toml` with it.

## Provisioning Commands

```bash
# Create all resources (idempotent — safe to re-run)
npx wrangler r2 bucket create yopedia-wiki 2>/dev/null || true
npx wrangler kv namespace create SEARCH_INDEX
npx wrangler vectorize create yopedia-embeddings \
    --dimensions 1536 --metric cosine 2>/dev/null || true
npx wrangler pages project create yopedia \
    --production-branch main 2>/dev/null || true
```

## Deploying

```bash
pnpm build
npx wrangler pages deploy .output/public --project-name yopedia
```

For preview deployments (PRs):
```bash
npx wrangler pages deploy .output/public \
    --project-name yopedia \
    --branch "$BRANCH_NAME"
```

## Data Migration

Upload existing wiki files to R2:

```bash
# Upload all wiki pages
for f in wiki/*.md; do
    slug=$(basename "$f")
    npx wrangler r2 object put "yopedia-wiki/wiki/$slug" --file "$f"
done

# Upload raw source files
for f in raw/*.md; do
    slug=$(basename "$f")
    npx wrangler r2 object put "yopedia-wiki/raw/$slug" --file "$f"
done

# Upload revision history
find wiki/.revisions -name '*.md' | while read f; do
    key=$(echo "$f" | sed 's|wiki/.revisions/|revisions/|')
    npx wrangler r2 object put "yopedia-wiki/$key" --file "$f"
done
```

## Rebuilding Derived Indexes

If KV search index is corrupted or stale, rebuild from R2:

```bash
# List all wiki pages in R2
npx wrangler r2 object list yopedia-wiki --prefix "wiki/" \
    | jq -r '.[] | .key'
```

Then re-index each page through the app's search index endpoint.

## Environment Variables

Required in CI (GitHub Actions secrets):
- `CLOUDFLARE_API_TOKEN` — wrangler auth
- `CLOUDFLARE_ACCOUNT_ID` — account identifier

For local dev:
```bash
npx wrangler login  # browser-based OAuth, stores token locally
```

## Concurrency

R2 supports conditional puts via ETags for optimistic concurrency:

```typescript
const obj = await R2.get('wiki/index.md');
const etag = obj.httpEtag;
const updated = modifyContent(await obj.text());
await R2.put('wiki/index.md', updated, {
    onlyIf: { etagMatches: etag }
});
// Retry on ETag mismatch
```

Use this for shared files (index.md, log.md) instead of in-process locks.

## Local Development

Miniflare emulates R2/KV/Vectorize locally:

```bash
npx wrangler dev          # starts local server with emulated bindings
npx wrangler pages dev    # for Pages projects
```

All R2/KV operations work locally without a Cloudflare account.

## Rules

- Never store wiki content in D1 or KV as primary storage — R2 only.
- KV indexes are disposable projections. Design for rebuild-from-R2.
- Always run `pnpm build` before deploying.
- Use `--branch` for preview deploys, never push untested code to production.
- Check `wrangler.toml` binding IDs match actual provisioned resources.
- After provisioning KV, update `wrangler.toml` with the namespace ID from output.
