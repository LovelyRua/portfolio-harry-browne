# Cloudflare Worker

This Worker serves the built React SPA and handles `/api/*` with Cloudflare D1.

## Local development

```powershell
Copy-Item .dev.vars.example .dev.vars
npm install
npm run db:migrate:local
npm run dev
```

Build the frontend first when testing static assets:

```powershell
cd ../frontend
npm install
npm run build
```

The checked-in zero UUID in `wrangler.jsonc` is a local placeholder. Replace it
with the ID returned by `npx wrangler d1 create portfolio-harry-browne` before
remote deployment.
