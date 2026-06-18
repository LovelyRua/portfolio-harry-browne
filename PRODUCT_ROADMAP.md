# Product Roadmap

This project is being shaped into a production-ready Permanent Portfolio planner: local-first for trust, cloud-backed for continuity, and opinionated enough that a user can understand what to do in the first minute.

## Current Product Shape

The app should help an individual investor track a Harry Browne-style Permanent Portfolio across four sleeves:

- Stocks
- Bonds
- Gold
- Cash

The primary workflow is:

1. Add assets and their current values.
2. Compare actual allocation against target allocation.
3. See whether rebalancing is needed.
4. Save locally by default.
5. Optionally sign in to back up the same portfolio JSON through the API.

## Phase 1: Reliability Baseline

Status: complete for the current local scope

Goal: make the existing app honest, testable, and hard to accidentally break.

Completed:

- Backend health endpoint.
- Unified API error response shape.
- Request size limit for JSON uploads.
- Authenticated data upload and download route.
- Structured portfolio payload validation.
- Smoke tests for health, auth rejection, schema parsing, and invalid data rejection.
- Frontend sync status that reflects local-only, saving, synced, loading, and failed states.
- Real API smoke test against a test account: register, login, upload, download, invalid upload rejection.
- Saved-data version migration for local, imported, and cloud payloads.
- Automated migration coverage for legacy and malformed saved data.
- Sample portfolio restore flow for repeatable local QA.
- Frontend integration tests for sign-in, cloud-load sync status, asset editing, and local persistence.

Acceptance:

- `npm run build` passes in the backend.
- `npm run test` passes in the backend.
- `npm run lint` and `npm run build` pass in the frontend.
- A new account can save and retrieve a portfolio.
- Invalid portfolio data returns a stable 400 JSON error.

## Phase 2: Core Portfolio Workflow

Status: complete

Goal: turn the dashboard into a complete daily-use tool.

Completed:

- Asset create, edit, duplicate, archive, restore, and delete flows.
- Delete confirmation for asset removal.
- Import and export portfolio JSON.
- Sample data restore flow.
- Snapshot history with restore and compare.
- Safety snapshot before restoring history.
- Cloud payload support for restorable snapshots.
- Rebalance recommendations with exact money deltas, side, drift, and priority.
- Cash deposit and withdrawal flows that explain why each sleeve receives or supplies money.
- Clear empty, error, and loading states for every panel.

Acceptance:

- A user can manage the portfolio without opening developer tools or editing storage.
- Every destructive action requires an explicit confirmation.
- History restore never overwrites current data without creating a backup snapshot.

## Phase 3: Account And Sync

Status: complete

Goal: make cloud backup predictable and transparent.

Completed:

- Manual sync now action.
- Manual load from cloud action.
- Safety snapshot before manually loading cloud data.
- Sync buttons reflect busy state.
- Sync status badge for local-only, saving, syncing, synced, failed, and loading.
- Cloud account identity shown in the header after sign-in.
- Last sync timestamp now comes from the server data record when available.
- Cloud conflict detection before overwriting a newer server backup.
- Session expiration handling that signs out and preserves local data.
- Dedicated conflict resolution view with local/cloud portfolio summaries and explicit actions.
- Full field-level diff for cloud conflicts when the portfolio grows more complex.

Acceptance:

- Users can tell whether data is local-only or cloud-backed.
- Sync failures preserve local changes.
- Logging out does not delete local data unless the user explicitly chooses that.

## Phase 4: Security And Operations

Status: in progress

Goal: reduce avoidable risk before any public deployment.

Planned work:

- Staging restore drill using a real backup. This requires access to the deployed staging database and backup storage.

Completed:

- Rate limiting for auth routes.
- Password policy and temporary account lockout for repeated failed sign-ins.
- CORS origin allowlist for deployed environments.
- Clear data security note documenting plain JSON cloud backups.
- Database backup and restore runbook.
- Server-side request logging with sensitive data redaction.
- Dependency update cadence.
- Non-destructive security test checklist.

Acceptance:

- Production environment has explicit CORS, JWT, database, and logging settings.
- Operational recovery steps are documented and tested.
- API rejects oversized, malformed, unauthenticated, and schema-invalid requests consistently.

## Phase 5: Product Polish

Status: complete

Goal: make both visual modes feel intentional, not like skins over the same layout.

Completed:

- Chart bundle split out of the main application chunk with lazy loading.
- First responsive and accessibility pass for focus states, modal semantics, pressed/current states, and small-screen layout.
- Workbench retains a dense dashboard layout while Wabi-sabi uses a distinct vertical ledger layout with responsive four/two/one-column allocation rhythm.
- Visual QA on real mobile/tablet browser sizes.
- Contrast and keyboard walkthrough with a dedicated accessibility audit tool.
- Both themes verified at 1280px desktop, 843px tablet, and 390px mobile widths with no page-level horizontal overflow.
- Both allocation charts remain rendered and responsive at all verified widths.
- WCAG AA text contrast verification completed for both themes.
- Chart keyboard semantics reduced to named chart images without unnamed internal focus stops.

Acceptance:

- First viewport communicates the main next action immediately.
- Both themes preserve the same product capability while changing the reading rhythm.
- No clipped text or incoherent overlap at common viewport widths.

## Engineering Rules Going Forward

- Treat frontend copy and backend behavior as one contract.
- Add tests when changing API contracts, saved data shape, or calculation behavior.
- Prefer small migrations over silent breaking changes.
- Keep local-first behavior even when cloud sync is enabled.
- Do not claim encryption unless the implementation actually encrypts before storage.
