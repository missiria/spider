# ADR-0005 — Opportunity Inbox: rule engine over stored data, fingerprint dedupe, audit trail

Date: 2026-10-15 · Status: accepted (MISS-0093, Sprint 5)

## Context
Turn Search Console changes into trackable work with evidence, without claiming causes.
Inputs available: daily totals (16 months) and per-dimension daily rows (90 days) in MySQL,
plus live API calls where a combination is needed.

## Decision
- **Rules** (`api/src/opportunities/rules.engine.ts`, pure and unit-tested) over a window of
  `window_days` (28) vs the previous window of the same length:
  - `clicks_drop` / `impressions_drop` — property and page level, min base + drop ratio;
    pages that vanished count as −100 %.
  - `low_ctr` — pages and queries in the top N positions with enough impressions and CTR
    below the threshold; evidence includes the clicks a 3 % CTR would add.
  - `near_page_one` — queries with average position in [8, 20] and enough impressions.
  - `cannibalization` — needs query × page, which is not stored (ADR-0004): one paginated
    `['query','page']` call per property per scan for the current window; queries where ≥ 2
    pages each hold ≥ `min_share` of impressions. Labelled low confidence, "possible".
  Thresholds live in `opportunity_rules` (JSON per workspace, `PUT /opportunities/rules`),
  merged over `DEFAULT_RULES`; unknown keys and bad types are ignored.
- **Score 0..100** from magnitude; default priority high ≥ 70, medium ≥ 40; confidence from
  the size of the base. Titles start with "Possible …" for drops and cannibalization. No
  finding is presented as a penalty or a confirmed cause (acceptance criterion).
- **Dedupe**: `fingerprint = md5(rule|property|subject|key)`, unique per workspace. Rescan
  refreshes evidence and `last_seen_at` on open / in-progress items, leaves dismissed items
  alone (only `last_seen_at`), and reopens a done item only when the finding returns after
  `regression_days` (14) — logged as a status event with the reason.
- **Tracking**: status open | in_progress | done | dismissed, priority, assignee (users
  table), due date, notes. Every change is an `opportunity_events` row (append-only,
  user or scanner). Completed/dismissed items are never deleted.
- **Before / after**: `completed_at` anchors a 14-day window on each side; totals come from
  `daily_metrics` (property) or `dimension_metrics` (page/query). The API states how many
  "after" days exist yet; GSC lags ~3 days.
- **Schedule**: daily at 07:30 after the 06:10 incremental sync; `POST /opportunities/scan`
  for an on-demand run (one at a time).
- URL Inspection data is **not** surfaced (2,000 inspections/day/site quota, not in this
  sprint's budget); the suggested actions point the user to Search Console instead.

## Consequences
- Scan cost: one query × page call (plus pagination) per property per day; everything else
  is SQL over stored rows. First fleet scan on 16 properties: 132 findings in a few seconds.
- The rule set is additive: a new rule is a function in the engine plus a value in the enum.
- Cross-property and sitemap/indexing rules wait for Sprint 6 inputs.
