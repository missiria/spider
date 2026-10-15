# Security review — Spider private beta (MISS-0095, 2026-10-15)

Scope: the code on `main` as of 2026-10-15, single-workspace invite-only beta. Re-run this
review when multi-tenant workspaces (Sprint 1) or OAuth (Sprint 2) land.

## Authentication and sessions

| Item | State |
|---|---|
| Credentials | bcrypt (cost 10) password hashes; `users.password_hash` never leaves the API (`toPublic()`), login replies carry only id/email/name/role. |
| Login brute force | `POST /auth/login` throttled 10 / minute / IP (429 after), failures logged with email + IP. |
| Token | JWT HS256, `JWT_SECRET`, 24 h expiry. **Production refuses to start** with a placeholder or < 32-char secret (`assertProductionConfig`). |
| Browser session | The Next route `/auth/session` performs the login **server-side** (credentials → API, client IP forwarded for the throttle) and stores the JWT in an **httpOnly, SameSite=Lax, Secure (https)** cookie `spider_session`; the token never reaches browser JavaScript (verified by E2E). The route rejects cross-site requests (`Sec-Fetch-Site`, `Origin`) and non-JSON bodies, so a third-party page cannot log a victim into an attacker account (login CSRF / session fixation). The API accepts the cookie via an extractor; the bearer header still works for scripts. Sign-out deletes the cookie. |
| CSRF | Cookie is SameSite=Lax and the API only accepts JSON bodies through the validation pipe; cross-site form posts cannot carry `application/json`. Revisit if any endpoint ever accepts form encoding. |
| Authorization | Global `AuthGuard` (every route except `/`, `/health`, `/auth/login`); `RolesGuard` with `@Roles('admin')` on user invites / deactivation. Profile edits are own-only (`/auth/me`). |
| Beta access | Invite-only: admins create accounts in System → Beta access; the temporary password is returned once and never stored in clear. Deactivation blocks login; self-deactivation refused. |

## Input validation and data access

- `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform`: unknown body fields → 400.
- All SQL through TypeORM parameters; the only user-supplied patterns (regex filters) are
  bound parameters to MySQL `REGEXP`, length-capped at 200, syntax-checked, and MySQL's
  `regexp_time_limit` (32 ms default) bounds evaluation. Invalid patterns → 400, never 500.
- Site URLs are normalised and validated (`normalizeSiteUrl`); nothing from the user is
  interpolated into Google API calls except the validated `siteUrl`.
- Saved-view configs are stored as opaque JSON (16 KB cap) and parsed defensively on read.
- Every read/write is scoped to the current workspace (`WorkspacesService.current()`); object
  lookups by id return 404 outside it (E2E: `/views/999999`, deleted property).

## Transport and headers

- API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  no-referrer`, `Permissions-Policy`, `Cache-Control: no-store`, `x-powered-by` removed,
  `trust proxy` for correct client IPs behind nginx/Cloudflare.
- Web: same family of headers plus HSTS (1 year) from `next.config.ts`; `poweredByHeader` off.
- CORS: `CORS_ORIGINS` allow-list with credentials; production start refuses an empty list.
- TLS terminates at Cloudflare (proxied DNS); nginx serves HTTP on the VPS loopback only
  (`deploy/nginx/spider.conf`). Use Cloudflare "Full (strict)" + certbot if the origin must
  also be encrypted.

## Google Search Console access

- One service account (ADR-0002), **read-only** scope `webmasters.readonly`; key arrives as
  `GSC_SERVICE_ACCOUNT_JSON` (base64) in `deploy/env/api.env`, gitignored. It is never
  returned by any endpoint (only `client_email` is).
- Rate limits respected by pacing (`GSC_PACE_MS`) and backoff; quotas documented in ADR-0004.
- Revoked access is detected by the checker and shown as "Access revoked"; data is retained
  until the property is deleted (documented in the onboarding screen).

## Outbound integrations (MISS-0094)

- Webhook payloads are signed (`X-Spider-Signature: t=…,v1=HMAC-SHA256(secret, t.body)`, secret
  shown once at creation, never returned again); receivers reject stale `t` (> 5 min) and bad
  HMACs — reference verifiers in `docs/WEBHOOKS.md`. Payloads carry only the workspace's own
  data; a webhook is scoped to its workspace.
- Webhook URLs: https on a public host in production (loopback / RFC 1918 / link-local refused),
  10 s timeout, redirects not followed, 4 attempts with backoff, admin-only management.
- Report emails go through the configured SMTP relay; recipients are validated and capped at 20
  per schedule; attachments are generated server-side from the stored data only.
- CSV exports neutralise spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).

## Audit and observability

- `opportunity_events` is append-only for every status/priority/assignee/due/note change.
- Sync runs keep `sync_runs` rows with per-dimension details and errors; failures surface on
  the property (`last_error`), on the System page and in `GET /settings/health` (used by
  `scripts/smoke.sh`).
- Login success/failure lines in the API log (pm2) with user id / email and IP.

## Known gaps (accepted for the private beta, tracked)

1. No per-user workspace membership yet: every signed-in user sees the single workspace
   (Sprint 1, MISS-0089). Keep the beta to one organisation.
2. No password reset / change flow: admins re-invite (new temporary password) if needed.
3. No Content-Security-Policy header yet (Next inline theme script needs a nonce strategy).
4. No MFA.
5. Rate limiting is per API process memory (no shared store); fine for one PM2 instance.
6. Backups rely on the VPS `mysqldump` cron described in `deploy/PRODUCTION.md`; no offsite copy
   is configured by this repo.

No critical or high finding remains open against the beta scope.
