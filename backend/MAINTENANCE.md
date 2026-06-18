# Backend maintenance

## Local workflow

```powershell
Copy-Item .env.example .env
npm install
npm run prisma:generate
npm run test
npm run build
npm run dev
```

## Database changes

Edit `prisma/schema.prisma`, then create and verify a migration:

```powershell
npm run prisma:migrate -- --name describe_the_change
npm run test
npm run build
```

Commit both the schema and generated migration SQL. Production and Docker use `prisma migrate deploy`; they never run the interactive development migration command.

## Release checks

- Set a strong `JWT_SECRET`.
- Restrict `CORS_ORIGINS`.
- Confirm `DATABASE_URL` points to the intended database.
- Run `npm run test` and `npm run build`.
- Verify `/health`, registration, login, upload and download.
- Back up PostgreSQL before migration or restore work.
