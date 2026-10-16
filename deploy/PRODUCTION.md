# Spider — production run-book

Domain `spider.missiria.dev` → A 81.17.98.31, Cloudflare **proxied** (set 2026-10-15). Cloudflare
terminates TLS; nginx on the VPS serves HTTP on :80 with `server_name spider.missiria.dev`
and HTTPS on :443 with a Let's Encrypt cert (`certbot certonly --nginx -d spider.missiria.dev`); the zone runs
Cloudflare SSL "Full", which needs the origin to answer on 443.

## First deploy (owner / VPS operator)

VPS: the EKSNEKS app server (root@81.17.98.31), clone at `/var/www/MISSIRIA/apps/spider-app`
like go-app / shark-app / leader-app. Node ≥ 20 (24 LTS) and pm2 are already installed there.

0. `git clone git@github.com:missiria/spider.git /var/www/MISSIRIA/apps/spider-app`, then work from
   that directory.
1. `cp deploy/env/api.env.example deploy/env/api.env` and `cp deploy/env/web.env.example deploy/env/web.env`,
   fill the secrets (both gitignored). The API **refuses to start** in production when
   `JWT_SECRET` is short/placeholder, `ADMIN_PASSWORD` is a placeholder, `GSC_MOCK=1` or
   `CORS_ORIGINS` is empty or `INTERNAL_PROXY_SECRET` is short/placeholder. Generate secrets with
   `openssl rand -base64 48`; `INTERNAL_PROXY_SECRET` must be identical in `api.env` and `web.env`.
2. MySQL 8 on the VPS: `CREATE DATABASE pro_spider_app_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
   plus a dedicated user with rights on that database only.
3. `npm ci && npm run build && npm run db:migrate` (`db:migrate` = `deploy/migrate.cjs`: it reuses the env
   parsed by `ecosystem.config.cjs`, so migrations hit the same database as pm2).
4. `pm2 start ecosystem.config.cjs && pm2 save` → `spider-api` (:8090) and `spider-web` (:8091).
5. nginx: symlink `deploy/nginx/spider.conf` into `/etc/nginx/sites-enabled/`, `nginx -t`, reload. The
   conf carries Cloudflare's `set_real_ip_from` ranges (refresh them from cloudflare.com/ips when they
   change) so rate limits and login logs see the visitor's IP; firewall :80/:443 to Cloudflare ranges
   only, otherwise a direct hit could spoof `CF-Connecting-IP`.
6. Register `spider` in the global `deploy <app>` batch (git pull → `npm ci` → build →
   `db:migrate` → `pm2 reload ecosystem.config.cjs`). GitHub secrets for
   `.github/workflows/deploy.yml`: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`.
7. Smoke test: `scripts/smoke.sh https://spider.missiria.dev <admin email> '<password>'`.
8. First login with `ADMIN_EMAIL` / `ADMIN_PASSWORD`; change the name/email in Settings; invite
   beta users from System → Beta access.

Gotcha: the global `deploy` script evaluates whether `db:migrate` exists **before** `git pull`. A commit
that adds or renames that script ships without migrating; re-dispatch with
`gh workflow run deploy.yml --ref main` after the first run finishes (never run `deploy spider` by hand
while an Actions deploy is running).

## Every deploy

`deploy spider` (or push to `main`) runs: `git pull` → `npm ci` → `npm run build` →
`npm run db:migrate` → `pm2 reload ecosystem.config.cjs`. CI (`.github/workflows/ci.yml`) must be
green on the commit: lint, typecheck, unit tests, API integration tests on MySQL, web and API builds.
After the deploy run the smoke script; it checks health, login, session cookie, headers and the
sync-health summary.

## Rollback

1. `pm2 logs spider-api --lines 100` to confirm what broke.
2. Code: `git checkout <previous tag or sha>` (release-please tags `web-vX.Y.Z` / `api-vX.Y.Z`),
   `npm ci && npm run build`, `pm2 reload ecosystem.config.cjs`.
3. Schema: migrations are additive so an older build runs on a newer schema. If a migration
   itself must go: `npm run migration:revert -w api` (one step per run), then redeploy.
4. Data: restore the last dump (below) only for data corruption, never for a code rollback.

## Backups

- Nightly dump (cron on the VPS, 03:30):
  `mysqldump --single-transaction pro_spider_app_db | gzip > /var/backups/spider/spider-$(date +%F).sql.gz`
  keep 14 days (`find /var/backups/spider -mtime +14 -delete`).
- `deploy/env/*.env` and the service-account key are **not** in git: keep a copy in the
  operator's password manager.
- Restore: `gunzip < dump.sql.gz | mysql pro_spider_app_db`, then `npm run db:migrate`.
- Everything in the database can be rebuilt from Google except: users, saved views,
  opportunities with their history and notes. Daily/dimension rows re-sync with
  "Full resync" (16 months of totals, 90 days of dimensions — older dimension rows are
  only in the backup).

## Monitoring

| Signal                           | Where                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process up                       | `pm2 status`; `GET /api/health` → `{"status":"ok"}` (public, use for uptime checks)                                                                                                                               |
| Sync failures / stale properties | System page in the app, or `GET /api/settings/health` (needs a session) → `ok:false` when a run failed in the last 36 h or a connected property has not synced in 36 h                                            |
| Property-level errors            | Properties page: `last_error` on the row; `sync_runs.details` for per-dimension counts/truncation                                                                                                                 |
| Google quota                     | 429s appear as retried warnings in `pm2 logs spider-api`; persistent 429 → raise `GSC_PACE_MS`                                                                                                                    |
| Logins                           | API log lines `login ok user=… ip=…` / `login failed email=… ip=…`                                                                                                                                                |
| Scans                            | `scan: N properties, N findings, N new, N refreshed` daily at 07:30                                                                                                                                               |
| Reports / alerts / webhooks      | Reports page: schedule `last_status` + deliveries; Settings → Alerts recent events; Settings → Webhooks deliveries (status, HTTP code, attempts); API log lines `report schedules: …`, `alerts: …`, `webhooks: …` |

Schedules (server time): access checks for pending properties every 10 min; incremental sync
06:10; opportunity scan 07:30; report schedules + alert evaluation hourly at :05; webhook
retries every 5 min (4 attempts: now, +5 min, +30 min, +2 h).

**Email**: set `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `MAIL_FROM_NAME` in `deploy/env/api.env`
(same relay as shark-app). Without `SMTP_HOST` the API starts but records every scheduled report
and email alert as **skipped** (visible on Reports / Settings → Alerts), never silently dropped.
Set `APP_PUBLIC_URL=https://spider.missiria.dev` so links in emails and webhook payloads resolve.

## Support procedures

- **Onboard a new customer (separate workspace)**: on the VPS, after a build,
  ```bash
  cd apps/spider/api
  node --env-file=../deploy/env/api.env dist/cli/create-workspace.js \
    --slug acme --name "ACME SEO" --admin-email seo@acme.com --admin-name "Jane Doe"
  ```
  It prints a one-time password for that admin; hand it over out of band. The admin invites
  their own team from System → Beta access. Workspaces never see each other's data (ADR-0007).
- **Lost device / leaked password**: System → Users → "Sign out everywhere" revokes every
  session of that user immediately; deactivation does the same and blocks login.
- **Partial sync** (System → "Fresh, incomplete", property banner "Incomplete data"): a
  dimension hit the page cap or its fetch failed; stored rows were kept. Run Full resync on the
  property once quota allows; the flag clears only after a complete backfill (ADR-0008).

- **Client cannot connect a property**: they must add the service-account email (Settings →
  Search Console access) as a Full or Restricted user on the exact property (URL-prefix with
  trailing slash, or `sc-domain:`). Check access can take a few minutes after Google saves it.
- **Access revoked**: the property shows "Access revoked"; data stays; re-sharing + Check access resumes.
- **Numbers differ from Search Console UI**: compare the same dates (data through today − 3),
  the same property type, and remember query tables only cover non-anonymised queries (coverage
  % is shown under each table).
- **Lost password**: an admin deactivates the user, then invites the same email again: the account is reactivated with a new one-time password and every old session is revoked.
- **Delete a client's data**: Properties → Remove deletes the property and all derived rows
  (verified by the integration test); users are deactivated, not deleted (audit trail).

## Known limitations (beta)

- One workspace per user; customer workspaces are created by the operator CLI above, no self-service sign-up. No Google OAuth: customers share properties with the service account.
- Web search type only (no image / video / news / Discover). Filters apply to one dimension at a time.
- Dimensional history is 90 days (configurable), daily totals 16 months. No page × query storage.
- URL Inspection data is not collected.
- No billing, plans or quotas: invite-only beta, no pricing exists.
- Cannibalization findings are heuristics; every finding states its confidence.
- Local development on macOS 13 needs the standalone MySQL tarball and the cached Playwright
  headless shell (see `docs/PLAN-MVP-1.md` and the wiki run-book).
