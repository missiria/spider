# Spider — MVP-1 plan: Fleet Overview module

Status: proposed 2026-10-15 (Sprint 0 output for MISS-0088, first build slice of EPIC MISS-0087).
Owner decision requested: "Go" to build. Everything below is a decision, not a question.

## 1. What MVP-1 ships

One module, end to end, that reproduces what the operator did by hand on 2026-10-15 with the
Search Console API: **a fleet table of every connected property (clicks / impressions / CTR /
position, last 28 days vs previous 28 days, delta) plus a daily chart**, fed by a stored copy of
GSC data, with a client onboarding flow that does not need Google OAuth app verification.

Screens (4):

| Route | Purpose |
|---|---|
| `/` | Fleet overview: table sorted by clicks, Δ vs previous period, chart of daily clicks (fleet total + per-property lines), date-range picker (28d default, 7/28/90/custom), "data as of" + freshness note |
| `/properties/new` | Add a property: enter `https://www.example.com/` or `sc-domain:example.com`, shows the service-account email to add in GSC (Settings → Users and permissions → Add user → Full), "Check access" button |
| `/properties/[id]` | One property: same KPIs + daily chart + top pages / top queries tables (last period), sync status, last sync, data since |
| `/settings` | Workspace name, service-account email (read-only), sync schedule info, danger zone (remove property + its data) |

Non-goals for MVP-1 (later sprints): multi-user auth and roles (Sprint 1), Google OAuth (Sprint 2),
query/page/country/device dimensional sync beyond the per-property top tables (Sprint 3),
saved views and regex filters (Sprint 4), opportunity inbox (5), reports/alerts (6), billing (7).

## 2. Onboarding = service account + checker (not OAuth)

The operator's own path on 2026-10-15: create a Google Cloud service account, share the GSC
property with its email as Full user, data is readable minutes later. No consent screen, no
Google OAuth app verification (weeks, and required for the `webmasters.readonly` sensitive
scope on a public app). MVP-1 reuses this exactly:

1. Spider holds **one** service account (`GSC_SERVICE_ACCOUNT_JSON`, base64 in env, never in the repo).
2. User adds a property URL. Spider stores it as `PENDING` and shows the service-account email
   plus the three GSC clicks to add it.
3. **Checker**: a server action "Check access" calls `sites.list` with the service account and
   looks for the property. Found → `CONNECTED`, first backfill queued. Not found →
   stays `PENDING` with a plain message ("Not shared yet. Google can take a few minutes after you
   add the user."). A cron endpoint (`GET /api/cron/check`, bearer `CRON_SECRET`) re-checks all
   `PENDING` properties every 10 minutes so the user does not have to click.
4. If the property later disappears from `sites.list` (user removed the email) → `REVOKED`,
   data kept, banner on the property page.

Trade-off recorded in ADR-0002: one shared service account means every client shares the same
daily API quota (Search Analytics: 1,200 QPM per site, effectively unlimited per day for this
volume) and the same identity in their GSC user list. Acceptable for an invite-only beta.
Per-workspace service accounts or OAuth come with Sprint 2.

## 3. Data model (TypeORM entities, MySQL 8)

```
users          id, email (unique), password_hash, name, role admin|member, is_active, timestamps
workspaces     id, slug (unique), name, created_at
properties     id, workspace_id, site_url (unique per workspace), display_name,
               status pending|connected|revoked|error, connected_at, last_checked_at,
               last_sync_at, data_since (first date with rows), last_error, timestamps
daily_metrics      id, property_id, date, clicks, impressions, ctr, position   UNIQUE(property_id, date)
dimension_metrics  id, property_id, date, dimension query|page|country|device|search_appearance, key_text,
                   key_hash (md5), clicks, impressions, ctr, position   UNIQUE(property_id, date, dimension, key_hash)
sync_runs          id, property_id, kind backfill|incremental, status running|ok|failed,
                   started_at, finished_at, rows_upserted, range_start, range_end, error, details (JSON per dimension)
```

Schema lives in `api/src/**/*.entity.ts`, migrations in `api/src/database/migrations`
(initial `Init` migration generated 2026-10-15). `workspaces` / `workspace_id` exist from day
one so Sprint 1 adds memberships without a data migration. MVP-1 runs with a single workspace
and an admin user created at first boot (`DefaultAdminSeeder`). DATE columns are read as
`YYYY-MM-DD` strings (`dateStrings: ['DATE']`), never as local-time JS Dates.

## 4. Sync (updated 2026-10-15 for MISS-0091, see ADR-0004)

- **Backfill** on connect: daily totals for 16 months in one call; then, per dimension
  (query, page, country, device), `['date', dim]` rows for the last `GSC_DIMENSION_BACKFILL_DAYS`
  (90) in 31-day chunks with `startRow` pagination; search appearance one call per day for
  `GSC_APPEARANCE_BACKFILL_DAYS` (28). "Full resync" in the UI re-runs this.
- **Incremental** daily 06:10: last 10 days of everything (GSC finalises late rows).
- Idempotent: upserts keyed by (property, date) and (property, date, dimension, key_hash).
- Quota: paced live calls (`GSC_PACE_MS`), retry/backoff on 429/5xx, 20-page cap per chunk
  with a `truncated` flag; `sync_runs.details` keeps rows/calls/days/truncated per dimension.
- Coverage shown in the UI per table: stored date range, days present, share of the property's
  clicks the rows explain (queries are always partial: Google hides low-volume queries).

## 5. Metrics and comparison (shared, tested helpers)

- Period = [start, end] inclusive. Previous period = same length ending the day before `start`.
- Clicks/impressions = sums. CTR = clicks / impressions (not an average of daily CTRs).
  Position = impressions-weighted mean of daily positions (matches GSC UI aggregation).
- Δ = (current − previous) / previous, shown as a signed percentage; "—" when previous = 0.
- Unit tests in `lib/metrics.test.ts` with the operator's real 2026-10-15 fleet numbers as fixtures.

## 6. Stack and conventions

- **eksneks-init monorepo** (ADR-0001, owner decision 2026-10-15): `api/` NestJS 11 +
  TypeORM 0.3 + mysql2, `web/` Next.js 15 App Router + Tailwind v4 + recharts + axios, same
  tooling as shark-app / leader-app (Husky in `web/.husky`, Makefile, PM2 ecosystem, release-please).
- `googleapis` in the API only; `class-validator` DTOs; jest (api) + vitest (web).
- `GSC_MOCK=1` serves fixtures from `api/fixtures/gsc` (16 real properties recorded 2026-10-15:
  16 months of daily totals + top 500 pages/queries for the last 28 days) so UI, sync and tests
  run without credentials.
- Local dev: MySQL 8 on :3403 (`make docker-up`, or any local mysqld on that port). No Redis.
- Auth in MVP-1 (ADR-0003): JWT login with a seeded admin, global guard, `@Public()` for
  `/health` and `/auth/login`; web `middleware.ts` checks the `token` cookie.
- Cron: `@nestjs/schedule` inside the API (every 10 min pending checks, 06:10 daily incremental).
- Prod: `spider.missiria.dev` (A 81.17.98.31, Cloudflare proxied, set 2026-10-15), PM2
  `spider-api` :8090 + `spider-web` :8091 behind nginx (`deploy/nginx/spider.conf`),
  `.github/workflows/deploy.yml` → VPS `deploy spider`. VPS registration still to do.

## 7. Build order (one PR per step, each runnable)

1. ✅ Scaffold with the `eksneks-init` skill (web + api workspaces, TypeORM, Husky, Makefile, PM2, deploy/).
2. ✅ `GscService` (service account, `listSites`, `query`) + `GSC_MOCK` fixtures.
3. ✅ `metrics.math.ts` period math + aggregation + jest tests against the 2026-10-15 numbers.
4. ✅ Properties: entity, normalize, CRUD, `checkAccess()` checker, 10-min cron.
5. ✅ Sync: backfill + incremental + top rows, `sync_runs` audit, daily cron, interrupted-run cleanup.
6. ✅ Web: `/` fleet table + chart + period picker, `/properties`, `/properties/new`, `/properties/[id]`, `/settings`, `/login`.
7. ⏳ Hardening + deploy: VPS registration of `deploy spider`, env files, nginx, first prod run.

Status 2026-10-15 15:00: steps 1–6 done and verified locally in mock mode (all 16 properties
match the hand-made fleet table). Step 7 needs the owner/VPS.

## 8. Acceptance (MVP-1)

- Add `https://www.puntomira.com/` → status PENDING with the service-account email shown →
  "Check access" → CONNECTED → backfill run OK → fleet table shows puntomira with the same
  28d numbers the operator posted on MITP-0056 (237 clicks / 8,741 impressions / 2.71% / 9.8).
- Add all 16 fleet properties → table matches the wiki "GSC fleet snapshot 2026-10-15" within
  GSC's own day-to-day revisions; chart shows daily lines.
- A property that is not shared stays PENDING with a clear message; removing the user in GSC
  flips it to REVOKED within one cron cycle.
- Re-running backfill or incremental sync twice does not duplicate rows.
- `GSC_MOCK=1 npm run dev` works with no Google credentials; `npm test` green; no secrets in git.

## 9. External items still required (owner)

- Service-account JSON for Spider: reuse `gsc-reader@eksneks-482004` for the beta, or create
  `spider-reader@…` in the same project (recommended, separate key, separate blast radius).
- DNS `spider.missiria.dev` → VPS, nginx vhost, MySQL database `spider` on the VPS (deploy step, later).
- Decision whether invite-only beta clients see the MISSIRIA service-account email (yes in MVP-1).
