# Dependency Policy

Keep dependency work boring and predictable.

## Cadence

- Patch updates: review weekly.
- Minor updates: batch monthly.
- Major updates: plan explicitly and test in a branch.
- Security updates: review as soon as they are reported.

## Update Workflow

1. Inspect the changelog for changed runtime behavior.
2. Update dependencies in the smallest sensible batch.
3. Run backend build and tests.
4. Run frontend type check and production build.
5. Run the manual API smoke path for register, login, save, and load.
6. Check the browser for the main dashboard and Settings sync panel.

## Commands

Backend:

```powershell
cd backend
npm run build
npm run test
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

## Review Notes

- Do not accept a major framework update only because it installs cleanly.
- Keep generated lockfile changes with the dependency update.
- Watch bundle size changes after frontend dependency updates.
- Recheck auth, sync, and import/export flows after API or validation library updates.
