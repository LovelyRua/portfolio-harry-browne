# Permanent Portfolio Planner

Local-first Harry Browne Permanent Portfolio planner with optional cloud backup.

## Repository layout

```text
.
├── backend/             Fastify + PostgreSQL self-hosted API
├── frontend/            React + Vite application
├── worker/              Cloudflare Worker + D1 deployment
├── docker-compose.yml   PostgreSQL and production-style backend
└── *.md                 Shared product, security and operations documentation
```

The frontend and backend are sibling applications. Each owns its package files, tests, build output and environment template.

For the serverless deployment path, see
[`CLOUDFLARE_DEPLOYMENT.md`](./CLOUDFLARE_DEPLOYMENT.md).

## Local development

Backend:

```powershell
cd backend
npm install
npm run prisma:generate
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

## Docker Compose backend

Create the root environment file:

```powershell
Copy-Item .env.example .env
```

Replace `JWT_SECRET` and `POSTGRES_PASSWORD`, then start the stack:

```powershell
docker compose up --build -d
docker compose ps
```

The backend waits for PostgreSQL, applies committed Prisma migrations, and starts on `http://localhost:3001`.

Stop it without deleting database data:

```powershell
docker compose down
```

Delete the local Docker database only when intentionally resetting it:

```powershell
docker compose down --volumes
```
