# Non-Destructive Security Checklist

Use this checklist for routine safety reviews without destructive testing.

## API Safety

- `/health` returns 200 and no secrets.
- Unauthenticated `/api/data` returns 401.
- Invalid portfolio payloads return 400 with `VALIDATION_ERROR`.
- Oversized JSON bodies are rejected by the backend body limit.
- Auth routes return 429 after repeated attempts.
- Login failures do not reveal whether an email exists.
- Weak registration passwords are rejected.

## Browser And Sync

- Signed-out data remains local-only.
- Sign-out does not delete local portfolio data.
- Cloud uploads contain a `pp-e2ee-v1` envelope and no asset names or amounts.
- The login password is sent only to authentication endpoints over HTTPS and
  is also used locally to derive the cloud encryption key.
- The cloud encryption credential is limited to `sessionStorage`, removed on
  sign-out, and never written to persistent `localStorage`.
- The recovery private key is absent from Git, CI and deployed assets.
- Manual cloud load creates a safety snapshot first.
- Cloud conflict state offers explicit local/cloud choices.
- Sync failures preserve local data.
- UI copy accurately describes recoverable client-side encryption.

## Configuration

- `JWT_SECRET` is not the example value.
- `CORS_ORIGINS` contains only deployed frontend origins.
- `DATABASE_URL` points to the intended environment.
- `LOG_LEVEL` is not `debug` in normal production.
- `.env` is not committed.

## Logs

- Authorization headers are redacted.
- Passwords are redacted.
- Tokens are redacted.
- Portfolio JSON is not dumped in ordinary request logs.

## Dependencies

- Run dependency audit before release.
- Review major version upgrades manually.
- Rebuild frontend and backend after updates.
- Re-run API smoke checks after updates.
