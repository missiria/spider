# ADR-0003 — MVP-1 authentication: single operator password

Date: 2026-10-15 · Status: accepted, temporary (superseded by MISS-0089 Sprint 1)

## Context
MVP-1 is a single-workspace internal/beta tool used by the operator to demo the Fleet Overview.
Real accounts, invitations, roles and tenant isolation are Sprint 1 scope.

## Decision
- `ADMIN_PASSWORD` env var; `/login` form; `middleware.ts` requires a signed httpOnly cookie
  (`SESSION_SECRET`) on every route except `/login`, `/api/cron/*` (bearer `CRON_SECRET`) and
  static assets.
- Data model already carries `Workspace` / `workspaceId`; the seed creates workspace `missiria`.

## Consequences
- No user table yet; nothing to migrate away except the cookie check.
- Not exposed publicly until Sprint 1 replaces it, or only behind an additional nginx
  basic-auth / IP allowlist if the owner wants an early demo URL.
