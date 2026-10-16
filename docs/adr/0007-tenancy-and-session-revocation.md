# ADR-0007 — Workspace membership and session revocation

Date: 2026-10-16 · Status: accepted (MISS-0110, closes the MVP-1 gaps of MISS-0089)

## Context

The MVP review of 1abd3e8 found two P1 issues: tokens kept working after deactivation (the JWT
strategy trusted its own claims), and `WorkspacesService.current()` returned the first workspace
for every user, so a second customer would have seen the first one's data.

## Decision

- **Membership table** `workspace_members (workspace_id, user_id)`, unique pair, FK cascades.
  The migration enrols every existing user in the oldest workspace, so the upgrade is
  transparent. MVP-1 keeps one membership per user (no switcher).
- **Request scope**: a middleware opens an `AsyncLocalStorage` store for every HTTP request.
  `JwtStrategy.validate()` loads the user, rejects missing / inactive users and stale
  `token_version`, resolves the membership and writes `{ userId, role, workspaceId }` into the
  store. `WorkspacesService.current()/currentId()` read only that store; the client never
  names a workspace.
- **No guessing in background work**: without a store, `current()` throws. Schedulers iterate
  `workspaces.all()` and call `runAs(id, fn)`; report schedules run under their own
  `workspace_id`. Webhook retries need no scope (each delivery belongs to one endpoint); the
  manual `POST /webhooks/process` is restricted to the caller's endpoints.
- **Cross-tenant references**: creating a view or report for another tenant's property is 404;
  assigning an opportunity to a non-member is 400; user admin actions on non-members are 404;
  `GET /users` and `/settings/health` only cover the caller's workspace.
- **Session revocation**: `users.token_version` is embedded in the JWT (`ver`). Deactivation
  and "Sign out everywhere" (admin for a member, or self) bump it; the next request with any
  older token is 401. Tokens issued before this change have no `ver` and count as version 0,
  so deploying does not sign everyone out. Role is read from the database on every request, so
  a demotion applies immediately.

## Consequences

- One indexed user lookup + one membership lookup per authenticated request (cheap at beta
  scale; cache with a short TTL if it ever shows up in profiles).
- Customer onboarding is an operator step (create workspace + first admin) until MISS-0089's
  self-service flow and MISS-0090's OAuth exist.
