# ADR-0001 — Stack: NestJS API + Next.js web monorepo, TypeORM + mysql2

Date: 2026-10-15 · Status: accepted (owner decision, supersedes the first draft that proposed Prisma)

## Context
EPIC MISS-0087 suggested a single Next.js app with Prisma and PostgreSQL. The EKSNEKS
workspace convention (apps/GEMINI.md, shark-app, leader-app, go-app) is an npm-workspaces
monorepo: `api/` NestJS 11 + TypeORM 0.3 + mysql2 on MySQL 8, `web/` Next.js App Router +
Tailwind v4 + vitest, PM2 processes behind nginx on one VPS, `deploy/env/*.env` loaded by
`ecosystem.config.cjs`. The owner asked on 2026-10-15 to use the same tools and libraries as
Shark and Leader, explicitly no Prisma.

## Decision
- Layout and tooling copied from shark-app: root `package.json` with workspaces `web`, `api`;
  `api/` = `@nestjs/{common,core,config,jwt,passport,platform-express,schedule,throttler,typeorm}`,
  `typeorm`, `mysql2`, `class-validator`, `class-transformer`, `bcryptjs`, `passport-jwt`, jest;
  `web/` = Next 15, React 19, Tailwind v4, axios, recharts, lucide-react, jwt-decode,
  react-toastify, vitest + jsdom.
- Database: MySQL 8 (`docker compose` locally, VPS MySQL in prod). Schema managed by TypeORM
  migrations in `api/src/database/migrations`, generated with `typeorm-ts-node-commonjs`
  against `src/database/data-source.ts` (leader-app pattern). `synchronize` is never on in prod.
- Auth: JWT bearer issued by `POST /auth/login` (users table, bcrypt), global `AuthGuard` with a
  `@Public()` decorator, web `middleware.ts` checks the `token` cookie (shark pattern).
- Ports: API 8040, web 8041 (shark uses 8030/8031). Local MySQL on 3398.

## Consequences
- Any EKSNEKS developer or agent can move between shark, leader and spider without relearning.
- Two processes to deploy (`spider-api`, `spider-web`) via the existing PM2 + GitHub Actions
  pattern; nginx proxies `/api/*` to the API.
- Google API access lives in the API (`googleapis`), never in the browser.
