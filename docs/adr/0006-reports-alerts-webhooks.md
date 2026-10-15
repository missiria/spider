# ADR-0006 — Reports, schedules, alerts and webhooks

Date: 2026-10-15 · Status: accepted (MISS-0094, Sprint 6)

## Context
Recurring reporting and handoffs: PDF/CSV exports that reproduce a saved configuration,
scheduled emails without duplicates, alerts on opportunities and failures, and a machine
channel for automation tools.

## Decision
- **Report template** (`reports`) = scope (fleet | property) + JSON config (period, sections,
  regex filters, row limit, notes). `GET /reports/:id/data` renders it from the same services
  the UI uses (OverviewService, OpportunitiesService), so a report always equals what the
  screen shows for that configuration. CSV per section (UTF-8 BOM, formula-injection guard),
  PDF via **pdfmake** (pure JS, no browser), branded from `workspaces.brand` (name, accent
  colour, footer; `PUT /settings/brand`, admin). Every PDF carries period + previous period,
  generation time, "data through", coverage notes per table and a definitions page.
- **Schedules** (`report_schedules`): weekly (day 1–7) or monthly (day 1–28) at an hour,
  recipients list, enabled flag (pause), `next_run_at`. An hourly worker runs due schedules.
  **Dedupe**: `report_deliveries` is unique on (schedule, period key = ISO week or month);
  a second run in the same slot is a no-op, so restarts or overlapping ticks never double-send.
  Failures are stored on the delivery and mirrored on the schedule (`last_status`,
  `last_error`) and shown in the UI. "Send now" uses a timestamped key.
- **Email** via nodemailer with the fleet's `SMTP_*` variables. Without `SMTP_HOST` the
  delivery is recorded as **skipped** ("SMTP not configured"), never silently lost.
- **Alerts** (`alert_rules`) are pull-based: hourly (and on demand) the service looks at the
  last 48 h of new open opportunities, failed sync runs and revoked properties, filters by the
  rule's config (priorities, rules, properties, flags) and delivers by email or to a webhook.
  `alert_events` is unique on (rule, subject) → one alert per finding per rule.
- **Webhooks** (`webhooks`, `webhook_deliveries`): HMAC-SHA256 signature
  `t=…,v1=…` over `"<t>.<body>"` with a per-endpoint secret shown once; delivery log with
  status/HTTP code/error; retries 5 min / 30 min / 2 h; unique (webhook, dedupe key); https +
  public host required in production; 10 s timeout, no redirects. Documented in
  `docs/WEBHOOKS.md` with verification code.
- Integrations named in the ticket (n8n, Notion, Leader) are reachable through the generic
  webhook/JSON export only; none is claimed as a packaged connector.

## Consequences
- No queue infrastructure: MySQL rows + cron are the queue, which fits one PM2 instance.
  Move to a real queue if delivery volume or multi-instance deployment requires it.
- PDFs are text-first (tables, no charts) to stay dependency-free; a chart image needs a
  headless browser or canvas, deferred.
- Email deliverability depends on the VPS SMTP relay already used by shark-app.
