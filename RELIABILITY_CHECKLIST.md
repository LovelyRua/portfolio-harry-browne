# Reliability Checklist

This is a low-risk checklist for checking the portfolio app before release.
It avoids heavy traffic, destructive actions, and large data writes. Run it only
against an environment you own.

## Scope

Check these areas:

- Backend health and API shape
- Register, login, token use
- Portfolio JSON upload and download
- Basic malformed input handling
- Reasonable payload-size behavior
- Frontend sync wording and error handling
- Logs and follow-up fixes

Do not run high-volume loops, large payload floods, or schema-changing commands
from this checklist.

## Services

Expected local services:

- Frontend: `http://localhost:5173/`
- Backend: `http://localhost:3001`
- API prefix: `http://localhost:3001/api`

Useful commands:

```powershell
netstat -ano | Select-String ':3001|:5173|:5174'
curl.exe -i http://localhost:3001/health
```

Expected health response:

```json
{"ok":true,"service":"portfolio-harry-browne-backend"}
```

## Baseline Checks

Run these first:

```powershell
cd backend
npm run build
npm run test
cd ..
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Expected:

- Backend build passes.
- Backend tests pass.
- Frontend type check passes.
- Frontend build passes.
- Vite may warn about chunk size; this is an optimization item, not a failed check.

## Account Flow

Use a unique test email each run.

```powershell
$email = "manual-check-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@example.test"
$password = "ManualCheck123!"
$auth = @{ email = $email; password = $password }

$register = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3001/api/auth/register `
  -ContentType 'application/json' `
  -Body ($auth | ConvertTo-Json -Compress)

$login = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3001/api/auth/login `
  -ContentType 'application/json' `
  -Body ($auth | ConvertTo-Json -Compress)

$headers = @{ Authorization = "Bearer $($login.accessToken)" }

[ordered]@{
  email = $email
  registered = $register.ok
  tokenReceived = [bool]$login.accessToken
} | ConvertTo-Json -Compress
```

Expected:

- Register returns `{ "ok": true }`.
- Login returns `accessToken`.
- Save the test email in the results table below.

## Data Sync Flow

Upload a small portfolio backup:

```powershell
$payload = @{
  payload = @{
    source = 'manual-reliability-check'
    timestamp = [DateTimeOffset]::UtcNow.ToString('o')
    assets = @(
      @{
        id = 'manual-1'
        name = 'Manual Check Cash'
        category = 'Cash'
        currency = 'USD'
        amount = 123
      }
    )
    baseCurrency = 'USD'
  }
}

$upload = Invoke-RestMethod `
  -Method Put `
  -Uri http://localhost:3001/api/data `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body ($payload | ConvertTo-Json -Depth 8 -Compress)

$download = Invoke-RestMethod `
  -Method Get `
  -Uri http://localhost:3001/api/data `
  -Headers $headers

[ordered]@{
  uploaded = $upload.ok
  returnedPayloadSource = $download.payload.source
  returnedAssetName = $download.payload.assets[0].name
} | ConvertTo-Json -Compress
```

Expected:

- Upload returns `{ "ok": true }`.
- Download returns the same `source`.
- Download returns asset name `Manual Check Cash`.

## Permission Checks

Without a token:

```powershell
curl.exe -i http://localhost:3001/api/data
```

Expected:

```json
{"error":{"code":"UNAUTHORIZED","message":"Missing Authorization header"}}
```

With a malformed token:

```powershell
curl.exe -i http://localhost:3001/api/data -H "Authorization: Bearer not-a-real-token"
```

Expected:

- HTTP `401`
- JSON error response
- No server crash

## Input Boundary Checks

Bad JSON should return `400`, not `500`:

```powershell
curl.exe -i `
  -X POST http://localhost:3001/api/auth/login `
  -H "Content-Type: application/json" `
  --data-raw "not-json"
```

Expected:

```json
{"error":{"code":"BAD_REQUEST","message":"Body is not valid JSON but content-type is set to 'application/json'"}}
```

Invalid email:

```powershell
$badAuth = @{ email = "not-an-email"; password = "ManualCheck123!" }
Invoke-WebRequest `
  -Method Post `
  -Uri http://localhost:3001/api/auth/register `
  -ContentType 'application/json' `
  -Body ($badAuth | ConvertTo-Json -Compress)
```

Expected:

- HTTP `400`
- Error code `VALIDATION_ERROR`

Short password:

```powershell
$badAuth = @{ email = "short-password@example.test"; password = "short" }
Invoke-WebRequest `
  -Method Post `
  -Uri http://localhost:3001/api/auth/register `
  -ContentType 'application/json' `
  -Body ($badAuth | ConvertTo-Json -Compress)
```

Expected:

- HTTP `400`
- Error code `VALIDATION_ERROR`

## Reasonable Payload Check

This checks normal upper-range behavior without stressing the service. Keep it
small enough to be a realistic user backup.

```powershell
$assets = 1..100 | ForEach-Object {
  @{
    id = "asset-$_"
    name = "Manual Asset $_"
    category = "Cash"
    currency = "USD"
    amount = $_
  }
}

$payload = @{
  payload = @{
    source = 'manual-100-asset-check'
    timestamp = [DateTimeOffset]::UtcNow.ToString('o')
    assets = $assets
    baseCurrency = 'USD'
  }
}

Invoke-RestMethod `
  -Method Put `
  -Uri http://localhost:3001/api/data `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body ($payload | ConvertTo-Json -Depth 8 -Compress)
```

Expected:

- Request completes normally.
- Server logs show a normal response time.
- Download still returns valid JSON.

## Frontend Checks

Open:

```text
http://localhost:5173/
```

Check:

- First screen has clear actions: `Add asset`, `Review`, `Snapshot`.
- Wabi-sabi mode still has clear data boundaries.
- Footer says plain JSON backup, not encrypted sync.
- Sync failure shows a user-facing notice.
- Sign-in modal does not claim encryption.

## Logs To Watch

Backend dev log:

```powershell
Get-Content backend-dev.log -Tail 80
```

Look for:

- `statusCode: 500`
- repeated unexpected restarts
- stack traces
- long response times for the normal checks above

## Results Template

| Check | Expected | Actual | Pass/Fail | Notes |
|---|---|---|---|---|
| Health | 200 ok |  |  |  |
| Register | ok true |  |  |  |
| Login | token received |  |  |  |
| Upload small payload | ok true |  |  |  |
| Download payload | source matches |  |  |  |
| No-token data read | 401 JSON error |  |  |  |
| Bad JSON | 400 JSON error |  |  |  |
| Invalid email | 400 validation |  |  |  |
| Short password | 400 validation |  |  |  |
| 100 asset payload | completes normally |  |  |  |
| Frontend footer wording | plain JSON backup |  |  |  |

Test account used:

```text
email:
date:
environment:
```

## Suggested Hardening Items

Recommended next changes:

- Add request size limits for `/api/data`.
- Add rate limiting for `/api/auth/register` and `/api/auth/login`.
- Validate the uploaded portfolio payload with a schema.
- Add a user-facing sync status indicator.
- Add integration tests for register, login, upload, and download.
- Use HTTPS in production.
- Do not describe sync as encrypted unless payload encryption is actually added.
