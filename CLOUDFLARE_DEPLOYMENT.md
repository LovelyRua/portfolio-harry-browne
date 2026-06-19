# Cloudflare deployment

The Cloudflare version uses Worker Static Assets for the React build and D1 for
accounts plus one JSON portfolio row per user. It does not use KV, R2, Queues,
Durable Objects, Workers AI, or other optional paid products.

## One-time setup

```powershell
cd worker
npx wrangler login
npx wrangler d1 create portfolio-harry-browne
```

Copy the returned database ID into `worker/wrangler.jsonc`, then configure a
random secret of at least 32 characters:

```powershell
npx wrangler secret put JWT_SECRET
npm run db:migrate:remote
```

## Deploy

```powershell
cd ../frontend
npm ci
npm run build

cd ../worker
npm ci
npm run deploy
```

Only `/api/*` and `/health` run Worker code. Static files are served directly by
Cloudflare Static Assets, keeping Worker and D1 usage low.

## GitHub Actions

The workflow at `.github/workflows/cloudflare.yml` runs tests and builds for
pull requests. Pushes to `main` additionally apply pending D1 migrations and
deploy the Worker plus the built frontend assets.

Add these GitHub repository or `production` environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`
- `JWT_SECRET`

Create a narrowly scoped Cloudflare API token with permission to edit Workers
scripts and D1 for the target account. `JWT_SECRET` must contain at least 32
random characters. The D1 database ID is injected into `wrangler.jsonc` only
inside the CI runner; it is not committed to the repository.
