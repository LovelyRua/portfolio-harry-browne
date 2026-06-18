# Data Security Notes

This project is local-first. The browser stores the active portfolio in local storage, and the optional cloud sync stores a JSON backup through the backend API.

## Current Behavior

- Portfolio data is saved locally first.
- Signing in enables a server-side JSON backup.
- Passwords are hashed before storage.
- New passwords must be at least 10 characters and include uppercase, lowercase, and numeric characters.
- Repeated failed sign-in attempts lock that email temporarily.
- API access uses bearer tokens.
- The backend validates portfolio payload shape before saving.
- Auth routes have a simple in-memory rate limit.
- CORS is restricted with `CORS_ORIGINS` in deployed environments.
- Backend request logging redacts auth headers, cookies, passwords, and token fields.

## Important Limitations

- The portfolio backup is not end-to-end encrypted.
- The backend can read the stored portfolio JSON.
- Browser local storage is only as safe as the user's device and browser profile.
- The in-memory auth rate limit and login lockout reset when the server process restarts.

## Before Public Deployment

- Set a strong `JWT_SECRET`.
- Set `CORS_ORIGINS` to the deployed frontend origin.
- Use TLS at the edge.
- Configure database backups.
- Review log output for sensitive fields.
- Decide whether portfolio JSON should be encrypted before storage.

Operational references:

- `OPERATIONS_RUNBOOK.md`
- `SECURITY_CHECKLIST.md`
- `DEPENDENCY_POLICY.md`
