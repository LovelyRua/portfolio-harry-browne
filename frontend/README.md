# Frontend

React, Vite and Tailwind frontend for the Permanent Portfolio Planner.

## Local development

```powershell
Copy-Item .env.example .env.local
npm install
npm run test
npm run build
npm run dev
```

The local environment points to the Fastify API at
`http://localhost:3001/api`. In the Cloudflare deployment, omit
`VITE_API_BASE_URL` so the app uses the same-origin `/api` Worker routes.
