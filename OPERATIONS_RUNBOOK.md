# Operations Runbook

This runbook covers the minimum production operations needed before exposing the app to real users.

The backend application, Prisma schema, migrations, and Dockerfile live under `backend/`. The root `docker-compose.yml` runs PostgreSQL and the backend together.

## Required Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: strong random secret, not the example value.
- `JWT_ISSUER`: stable service identifier.
- `JWT_EXPIRES_IN`: token lifetime, currently `7d` by default.
- `CORS_ORIGINS`: comma-separated deployed frontend origins.
- `LOG_LEVEL`: `info` for normal operation, `debug` only for short investigations.

## Health Check

Use:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/health -Method Get
```

Expected response:

```json
{
  "ok": true,
  "service": "portfolio-harry-browne-backend"
}
```

## Backup

Before any deployment, migration, or restore:

1. Confirm the target database in `DATABASE_URL`.
2. Create a timestamped PostgreSQL backup with your hosting provider or `pg_dump`.
3. Store the backup outside the application server.
4. Record the backup timestamp and deployment version.

Suggested backup filename:

```text
portfolio-harry-browne-YYYYMMDD-HHMMSS.dump
```

## Restore

Restore should be treated as a controlled operation.

1. Stop application writes or put the app in maintenance mode.
2. Create a fresh backup of the current database before restoring.
3. Restore the selected backup into a staging database first.
4. Run `/health`.
5. Register a test account and confirm portfolio save/load works.
6. Restore into production only after staging verification.
7. Restart the backend and verify `/health` again.

## Staging Restore Drill

This is the only release-readiness item that requires deployed infrastructure rather than the local workspace.

Before starting, the operator must provide:

- A staging `DATABASE_URL` that is clearly separate from production.
- Access to one real PostgreSQL backup file or provider snapshot.
- Permission to replace data in the staging database.
- The deployed staging backend URL.

Record the following before changing staging:

```text
Drill date:
Operator:
Application version/commit:
Staging database identifier:
Backup filename or snapshot ID:
Backup created at:
Pre-restore staging backup ID:
```

Run the drill:

1. Confirm the hostname and database name in the staging `DATABASE_URL`.
2. Disable staging application writes.
3. Create a fresh pre-restore backup of the current staging database.
4. Restore the selected real backup into staging.
5. Start the staging backend and call `/health`; require HTTP 200 and `"ok": true`.
6. Sign in with a dedicated staging test account.
7. Load the cloud portfolio and record its asset count, base currency, and snapshot count.
8. Make one harmless staging-only portfolio change, sync it, reload the page, and confirm it persists.
9. Check backend logs for unexpected 500 responses, database errors, or leaked credentials.
10. Re-enable staging writes only after all checks pass.

Completion record:

```text
Restore command/provider action:
Health check result:
Portfolio load result:
Round-trip sync result:
Log review result:
Started at:
Completed at:
Rollback required: yes/no
Notes:
```

If any step fails, stop the drill, preserve logs, and restore the pre-restore staging backup.

## Logging

The backend logger redacts sensitive fields:

- Authorization headers
- Cookies
- Password fields
- Access tokens
- Generic token fields

Do not log raw request bodies in production unless a narrow incident requires it and sensitive fields are redacted.

## Incident Checklist

- Confirm whether local-first browser data is still safe for affected users.
- Check API health.
- Check database connectivity.
- Check recent deploys and migrations.
- Check auth error rates and rate-limit responses.
- Preserve logs before restarting services.
- Communicate whether cloud backup is affected or only the live API.
