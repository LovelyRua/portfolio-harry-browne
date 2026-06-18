# Backend

Fastify API for optional portfolio cloud backup.

## Commands

```powershell
npm install
npm run prisma:generate
npm run test
npm run build
npm run dev
```

Production containers run `prisma migrate deploy` before starting the compiled server.

## API

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/data`
- `PUT /api/data`

Authenticated data routes expect `Authorization: Bearer <token>`.
