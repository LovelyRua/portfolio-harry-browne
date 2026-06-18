# Frontend maintenance

## Local workflow

```powershell
Copy-Item .env.example .env.local
npm install
npm run test
npm run lint
npm run build
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:3001/api` when the backend is running locally.

The frontend owns portfolio calculations and local-first persistence. The backend is optional and only provides account authentication and JSON cloud backup.

After API, saved-data, or sync changes, run the integration tests and manually verify sign-in, sync status, asset editing, import/export, and both visual themes.
