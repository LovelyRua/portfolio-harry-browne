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
pull requests and pushes to `dev`. Pushes to `main` additionally apply pending
D1 migrations and deploy the Worker plus the built frontend assets.

Add these GitHub repository or `production` environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Create a narrowly scoped Cloudflare API token with permission to edit Workers
scripts and D1 for the target account. `JWT_SECRET` must contain at least 32
random characters. The non-sensitive D1 database ID is stored directly in
`worker/wrangler.jsonc`. CI passes `JWT_SECRET` through Wrangler's
`--secrets-file` option, which uploads code and secrets atomically and also
works for the first deployment. `EMAIL_FROM` must be a sender authorized by
your Resend account, such as
`Permanent Portfolio Planner <noreply@example.com>`. Deployment fails instead
of silently breaking registration when either email setting is absent.
