# Spider App

MISSIRIA Spider — multi-site SEO SaaS turning Google Search Console data into prioritized action (EPIC MISS-0087).
Fullstack monorepo: **Next.js** web + **NestJS** API + **MySQL** (TypeORM), same shape as shark-app / leader-app.

Plan and decisions: `docs/PLAN-MVP-1.md`, `docs/adr/`.

## Quick start

```bash
npm install
make docker-up          # MySQL on :3403 (or any local mysqld on 3403)
cp api/.env.dist api/.env
npm run dev:api         # API on :8012
npm run dev:web         # Web on :3010
```

`GSC_MOCK=1` (default in `api/.env.dist`) serves Search Console fixtures from `api/fixtures/gsc`, so the app runs without Google credentials. See `make help` for all commands.

## Layout

- `api/` — NestJS 11, TypeORM, JWT auth, migrations, Google Search Console sync
- `web/` — Next.js 15 (App Router, Tailwind 4, Turbopack)
- `deploy/` — nginx + env examples, PM2 `ecosystem.config.cjs`

## Tests

```bash
npm run check            # lint + typecheck + unit tests (api jest, web vitest)
npm run test:e2e:api     # API integration tests on MySQL db pro_spider_app_test (migrations + GSC fixtures)
npm run test:e2e:web     # Playwright smoke suite against running web (:3010) + api (:8012)
npm run smoke -- https://spider.missiria.dev admin@… 'password'   # post-deploy smoke test
```

`test:e2e:api` needs the test database once: `CREATE DATABASE pro_spider_app_test` (same user as
`api/.env`). On macOS 13 set `PW_BIN` to the cached headless shell for Playwright (see
`web/playwright.config.ts`). CI runs all of it on every push (`.github/workflows/ci.yml`).

Security review and operations: `docs/SECURITY.md`, `deploy/PRODUCTION.md`.
