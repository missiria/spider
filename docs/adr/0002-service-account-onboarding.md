# ADR-0002 — Property onboarding via shared service account + access checker

Date: 2026-10-15 · Status: accepted for MVP-1 (OAuth planned in Sprint 2, MISS-0090)

## Context
Google OAuth with the `webmasters.readonly` scope on a public app requires OAuth app
verification (brand verification, privacy policy, review; typically weeks). The operator
connected 16 properties on 2026-10-15 in minutes by sharing each GSC property with a service
account email. Clients can do the same with three clicks in Search Console.

## Decision
- Spider runs with one Google service account (`GSC_SERVICE_ACCOUNT_JSON`, base64, env only).
- Onboarding shows the account email and the GSC steps; a **checker** (`sites.list`) confirms
  access on demand and on a 10-minute cron until the property is `CONNECTED`.
- Loss of access detected the same way → `REVOKED`, data retained, user prompted.

## Consequences
- No consent screen, no verification, no token refresh logic in MVP-1.
- Shared identity and shared quota across clients; acceptable for an invite-only beta.
  Mitigation path: one service account per workspace (Sprint 2 option B) or OAuth (option A).
- Clients see a MISSIRIA-owned email in their GSC user list; the onboarding copy says so.
- Read-only: the service account is only ever added as GSC "Full" or "Restricted" user by the
  client; Spider never writes to GSC in MVP-1.
