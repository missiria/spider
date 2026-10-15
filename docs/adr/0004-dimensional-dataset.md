# ADR-0004 — Dimensional dataset: date × one dimension, paginated, coverage disclosed

Date: 2026-10-15 · Status: accepted (MISS-0091, Sprint 3)

## Context
MVP-1 stored daily totals plus a fixed 28-day top-500 list per property. Sprint 3 needs
query / page / country / device / search-appearance data by day so any date range can be
explored and compared, with honest coverage notes (the Search Analytics API omits
anonymised queries and caps rows).

## Decision
- Table `dimension_metrics` = one row per (property, date, dimension, key): `dimension` ∈
  {query, page, country, device, search_appearance}, `key_text` + `key_hash` (md5, keeps the
  unique index short), clicks, impressions, ctr, position. Unique on
  (property_id, date, dimension, key_hash); index (property_id, dimension, date).
- One dimension per row set, not combinations. `page × query` would multiply rows ~10× for
  little MVP value and `searchAppearance` cannot be combined with anything in the API.
- Fetch: `dimensions: ['date', <dim>]` in 31-day chunks, following `startRow` pagination up
  to 20 pages (500k rows) per chunk; a chunk that hits the cap is flagged `truncated` in the
  run details and logged. Search appearance needs one call per day (`dimensions:
  ['searchAppearance']`, the API refuses `date` alongside it).
- Depth is configurable: daily totals always 16 months; `GSC_DIMENSION_BACKFILL_DAYS`
  (default 90) for the four main dimensions; `GSC_APPEARANCE_BACKFILL_DAYS` (default 28)
  because of its per-day cost. Incremental runs re-pull the last 10 days of everything.
- Quota: calls are paced (`GSC_PACE_MS`, default 120 ms → ≤ 500/min, under the 1,200
  QPM/site limit) and retried on 429/5xx with exponential backoff. Every `sync_runs` row
  stores `details` JSON: rows, calls, days and truncated flag per dimension.
- Reads aggregate the stored rows over the requested period (Σ clicks, Σ impressions,
  impressions-weighted position) and return, per dimension, the stored date range, the
  number of days present and a **coverage ratio** = Σ dimension clicks / property clicks.
  The UI shows it ("query rows explain 55% of clicks; Google hides low-volume queries";
  "9% of clicks came from results with a special appearance").
- `top_rows` (fixed-period snapshot) is dropped; top pages/queries are now derived for the
  selected period.

## Consequences
- Row volume for the fleet at 90 days: ~82k rows (16 properties); IPE alone ~12k query rows.
  Growth ≈ 1k rows/day fleet-wide at the current size — fine for MySQL with the indexes above.
- Backfill cost per property ≈ 4 dimensions × 3 chunks + 28 appearance calls ≈ 40 calls.
- Combined dimensions (page × query, country × device) and non-web search types (image,
  video, news, discover) are not stored; add them as new `dimension` values or a
  `search_type` column when a Sprint needs them.
