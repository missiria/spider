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

## 3. Data model (Prisma, MySQL 8)

```
Workspace      id, name, slug, createdAt
Property       id, workspaceId, siteUrl (unique per workspace), displayName,
               status PENDING|CONNECTED|REVOKED|ERROR, connectedAt, lastCheckedAt,
               lastSyncAt, dataSince (first date with rows), lastError
DailyMetric    id, propertyId, date, clicks, impressions, ctr, position
               @@unique([propertyId, date])
TopRow         id, propertyId, periodStart, periodEnd, dimension PAGE|QUERY, key,
               clicks, impressions, ctr, position   @@unique([propertyId, periodStart, periodEnd, dimension, key])
SyncRun        id, propertyId, kind BACKFILL|INCREMENTAL|TOP, startedAt, finishedAt,
               status RUNNING|OK|FAILED, rowsUpserted, error
```

`Workspace` and `workspaceId` exist from day one so Sprint 1 adds users/memberships without a
data migration. MVP-1 runs with a single workspace created by `prisma db seed`.

## 4. Sync

- **Backfill** on connect: one `searchanalytics.query` per property, `dimensions: [date]`,
  `startDate = today − 16 months` (GSC retention), `endDate = today − 1`, `rowLimit 25000`
  (≈ 490 rows, one call). Upsert into `DailyMetric`.
- **Incremental** daily (`GET /api/cron/sync`, cron, bearer secret): re-query the last 10 days
  per property (GSC finalises data ~3 days late and backfills late rows) and upsert.
- **Top tables** per property after each sync: `dimensions: [page]` and `[query]` for the
  current period (28d default), `rowLimit 500`, stored in `TopRow` for the period.
- Idempotent: all writes are upserts keyed by (property, date | key). Re-running a job is safe.
- Quota/backoff: 429/5xx → exponential retry (3 attempts), then `SyncRun.FAILED` with the error
  shown in the UI. Never present partial data as complete: a property whose last run failed shows
  a warning chip, and the fleet table footer says "N of M properties synced today".
- Freshness: the overview states "GSC data through <endDate>, synced <lastSyncAt>", and the
  comparison windows are computed on the server from `DailyMetric` so table and chart agree.

## 5. Metrics and comparison (shared, tested helpers)

- Period = [start, end] inclusive. Previous period = same length ending the day before `start`.
- Clicks/impressions = sums. CTR = clicks / impressions (not an average of daily CTRs).
  Position = impressions-weighted mean of daily positions (matches GSC UI aggregation).
- Δ = (current − previous) / previous, shown as a signed percentage; "—" when previous = 0.
- Unit tests in `lib/metrics.test.ts` with the operator's real 2026-10-15 fleet numbers as fixtures.

## 6. Stack and conventions

- **Next.js 15 App Router + TypeScript + Tailwind v4**, single deployable Node app
  (epic rule). Server actions for mutations, Route Handlers for cron endpoints.
- **Prisma + MySQL 8** (ADR-0001: the VPS already runs MySQL 8 for shark/go/leader; one
  database engine in production. The epic suggested PostgreSQL; nothing in MVP-1 needs it).
- `googleapis` for GSC, `recharts` for the chart, `zod` for input validation, `vitest` for tests.
- `GSC_MOCK=1` serves fixtures from `fixtures/gsc/*.json` (recorded from the real 2026-10-15 pull)
  so the UI, sync and tests run without credentials.
- Local dev: `docker compose up db` (MySQL 8) or any local MySQL via `DATABASE_URL`. No Redis.
- Auth in MVP-1 (ADR-0003): single operator password in `ADMIN_PASSWORD`, checked in
  `middleware.ts` with an httpOnly cookie. Replaced by real accounts in Sprint 1 (MISS-0089).
- Prod later: `spider.missiria.dev`, PM2 process `spider-web` behind nginx, deploy via the
  existing GitHub Actions → VPS pattern. Not part of MVP-1.

## 7. Build order (one PR per step, each runnable)

1. Scaffold: `create-next-app`, Tailwind, Prisma schema + first migration, seed workspace,
   `.env.example`, README, vitest, CI (`npm run lint && npm run typecheck && npm test`).
2. `lib/gsc.ts` client (service account, `listSites`, `queryDaily`, `queryTop`) + mock mode + fixtures.
3. `lib/metrics.ts` period math + aggregation + tests.
4. Properties: model, `/properties/new`, checker action, `/api/cron/check`.
5. Sync: backfill + incremental + top rows, `SyncRun` status, `/api/cron/sync`.
6. UI: `/` fleet table + chart + date range; `/properties/[id]`; `/settings`; empty/loading/error states.
7. Hardening: password middleware, rate limit on cron endpoints, `npm audit`, README run-book.

Estimate: 7 steps, each 1–3 hours of agent work; MVP-1 demo-able after step 6.

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
