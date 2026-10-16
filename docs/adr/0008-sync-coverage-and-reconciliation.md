# ADR-0008 — Sync completeness, reconciliation and consistent filters

Date: 2026-10-16 · Status: accepted (MISS-0110, refines ADR-0004)

## Context

The MVP review found that a run whose pagination hit the safety cap was still `ok` and
refreshed `last_sync_at`; that rows Google stopped returning stayed stored forever (upsert
only); that the in-memory lock could leak when inserting the run row failed; and that regex
filters changed the tables but not the KPIs, chart or comparison.

## Decision

- **Run outcome** is `ok`, `partial` or `failed`. Daily totals failing = `failed` (nothing
  trusted). A dimension that hits the page cap (`truncated`) or whose fetch throws makes the run
  `partial`; the other dimensions still sync. `properties.last_sync_status` and a JSON
  `properties.coverage` record per dimension `status` (complete / truncated / failed), the
  `reason` (`page_cap` = our pagination limit, `error` = failed ingestion) and
  `since_backfill_incomplete`. Google's own omission of anonymised queries is _not_ a coverage
  failure: it stays the breakdown coverage ratio. Freshness (`last_sync_at`) and completeness
  (`last_sync_status`, health `complete`) are reported separately in API, UI and health.
- **Reconciliation**: every stored row carries the `run_id` that wrote it. After a window
  (31-day chunk, appearance range, or the daily range) is fetched **completely**, rows of that
  window not written by this run are deleted. Truncated or failed windows are never reconciled,
  so a partial response cannot erase valid history. Re-running is idempotent.
- **Opportunities**: dimensions flagged incomplete since the last complete backfill are skipped
  by the rule engine (no false drops). Only a complete backfill clears the flag, because an
  incremental run re-fetches 10 days and cannot repair older windows. The UI tells the user to
  run a Full resync.
- **Lock**: the in-flight lock is released when the run insert fails, as on every other path.
- **Filters** (MISS-0092 common filter state): one filter state per page and report — regex on
  query or page, or a key list on country or device. Because rows are date × ONE dimension,
  a filter can only be evaluated on its own dimension: with a filter active, KPIs, chart and
  comparison are computed from the matching rows of that dimension, and breakdowns of other
  dimensions return `unavailable: cross_dimension` with an explanation. Filters on two
  dimensions at once are rejected (400). Coverage ratios stay relative to unfiltered totals.
  When the comparison period has no stored rows, `previous` is null and deltas are null
  (never a fake +100 %). Non-web search types (image, video, news, Discover) are **not
  ingested**; every number is Search Console _web_ search. This restriction is documented
  here and in docs/MVP-STATUS.md; adding a search-type selector means one more key in the
  stored rows.
- **Dates**: strict ISO calendar dates, `start <= end`, ≤ 487 days, `days` integer 1–487;
  anything else is 400.

## Consequences

- Cross-dimension filtering (e.g. page × country) would need date × dimension-pair storage;
  out of MVP scope and explicitly unavailable rather than approximated.
- Rows deleted by reconciliation are re-created by the next complete fetch if Google returns
  them again; history outside fetched windows is never touched.
