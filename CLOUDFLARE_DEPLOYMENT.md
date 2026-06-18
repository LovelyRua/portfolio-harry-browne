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
