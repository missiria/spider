# ADR-0001 — Stack: single Next.js app, Prisma, MySQL 8

Date: 2026-10-15 · Status: accepted (reversible)

## Context
EPIC MISS-0087 asks for Next.js App Router, TypeScript, Tailwind, PostgreSQL, Prisma, as one
deployable Node application. The EKSNEKS workspace convention (apps/GEMINI.md) is NestJS API +
Next.js web + MySQL 8 + TypeORM monorepos deployed with PM2 behind nginx on one VPS, which
already runs MySQL 8 for shark-app, go-app and leader-app and runs no PostgreSQL.

## Decision
- One Next.js 15 app (App Router, server actions, route handlers). No separate NestJS API:
  MVP-1 has no third-party API consumers and the epic explicitly prefers one deployable.
- Prisma ORM with **MySQL 8**, not PostgreSQL: one database engine on the production VPS,
  same local `docker compose` habit as the sibling apps. Nothing in the MVP needs
  PostgreSQL-only features. Switching the Prisma provider later is a schema-level change.
- Tailwind v4, recharts, zod, vitest, googleapis.

## Consequences
- Deploy fits the existing PM2 + GitHub Actions pattern (`spider-web`, one process).
- If a NestJS API becomes necessary (public API, workers), extract it then; the Prisma schema
  and `lib/` modules are framework-neutral.
