# Spider App

MISSIRIA Spider — multi-site SEO SaaS turning Google Search Console data into prioritized action (EPIC MISS-0087).
Fullstack monorepo: **Next.js** web + **NestJS** API + **MySQL** (TypeORM), same shape as shark-app / leader-app.

Plan and decisions: `docs/PLAN-MVP-1.md`, `docs/adr/`.

## Quick start

```bash
npm install
make docker-up          # MySQL on :3403
cp api/.env.dist api/.env
npm run dev:api         # API on :8012
npm run dev:web         # Web on :3010
```

`GSC_MOCK=1` (default in `api/.env.dist`) serves Search Console fixtures from `api/fixtures/gsc`, so the app runs without Google credentials. See `make help` for all commands.

## Layout

- `api/` — NestJS 11, TypeORM, JWT auth, migrations, Google Search Console sync
- `web/` — Next.js 15 (App Router, Tailwind 4, Turbopack)
- `deploy/` — nginx + env examples, PM2 `ecosystem.config.cjs`
