# ADR-0003 — MVP-1 authentication: JWT login with a seeded admin (shark pattern)

Date: 2026-10-15 · Status: accepted, extended by MISS-0089 (Sprint 1: invitations, roles, workspaces per user)

## Context
MVP-1 is a single-workspace beta. shark-app and leader-app already implement the same thing:
`users` table, bcrypt password, `POST /auth/login` → JWT, global guard, a default admin seeded
from env at boot.

## Decision
- `users` (id, email unique, password_hash, name, role `admin|member`, is_active, timestamps).
- `DefaultAdminSeeder` creates `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `deploy/env/api.env` on
  first boot if no user exists (same as shark).
- API: `AuthModule` (JwtStrategy, `AuthGuard` as `APP_GUARD`, `@Public()` for `/auth/login` and
  `/health`). JWT secret `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (24h).
- Web: login page stores the token in an httpOnly-less `token` cookie read by `middleware.ts`
  (same as shark; revisit with Sprint 1 hardening), axios client sends `Authorization: Bearer`.
- Cron endpoints are internal NestJS `@Cron` jobs (`@nestjs/schedule`), not HTTP, so no cron
  secret is needed.

## Consequences
- Sprint 1 adds memberships and per-user workspace scoping on top of this table, no rewrite.
