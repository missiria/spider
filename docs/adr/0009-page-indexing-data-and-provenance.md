# ADR-0009 — Page indexing: data sources and provenance

Date: 2026-11-18 · Status: accepted (MISS-0192, formerly MITP-0833)

## Context

Spider only used Search Analytics, so indexing problems that Search Console shows (for example
"Not found (404)", 10 pages) never reached Spider. The public Search Console API has Search
Analytics, Sites, Sitemaps and single-URL Inspection, but **no endpoint for the Page indexing
report**: its totals, reasons, trend and example URLs exist only in the UI and its Export
(ZIP of CSV files, at most 1,000 example rows). Validation ("Validate fix") and live URL tests
are not in the API either.

## Decision

- **Three sources, never added together.** Every response, screen block and export names its
  source:
  - `gsc_export`: the Page indexing export an operator uploads. The only source of report-wide
    totals, reasons, trend, validation status and example URLs.
  - `url_inspection_api`: Google's view of the indexed version of the URLs Spider tracks.
  - `live_http`: Spider's own fetch of a URL (status, redirects, canonical, robots). Not Google.
    A set of inspected URLs is not "All known pages" and is never presented as such.
- **Reasons are data, not an enum.** A reason is stored with Google's wording plus a hash of its
  normalised text (`reason_hash`). New or renamed reasons need no schema or code change.
  `indexing/reasons.ts` only classifies known texts as `likely_defect`, `intentional` or
  `review` (unknown). The classification is Spider's reading, shown as such.
- **Scopes stay apart.** An import belongs to one view: `all_known`, `submitted` or one
  `sitemap` (`scope` + `scope_detail`, hashed into `scope_hash`). Reads take one scope; counts
  of different scopes are never combined.
- **Imports are snapshots.** One `indexing_imports` row per uploaded file, with its
  `indexing_reasons`, `indexing_trend` and `indexing_examples`. Uploading the same view and
  report date again replaces that import (idempotent); older report dates are kept for trend,
  "first seen" and the rules. "First seen" is the earliest report imported into Spider, not
  Google's detection date. `examples_partial` is set when an example table has 1,000 rows.
  The parser refuses an export whose Metadata names another property.
- **Collection job** (`sync_runs.kind = indexing`, daily 05:00 and on demand):
  Sitemaps API snapshot (`gsc_sitemaps`) → sitemap XML read over HTTP (index files followed,
  capped, `urls_truncated` flag) and pages with impressions in 28 days → `tracked_urls` →
  URL Inspection for up to `INDEXING_DAILY_INSPECTIONS` URLs per property per day (default 200,
  hard ceiling 1,900 against Google's 2,000), never-inspected sitemap URLs first. Each call is
  counted in `gsc_quota_usage`; each result is one `url_inspections` history row with the raw
  response. A 429 stops the run as `partial` / `quota`; a 403 as `partial` /
  `permission_denied`, keeping earlier data.
- **Opportunities.** Six rules (the sixth, `not_indexed_reason`, is described below) in `opportunities/indexing.rules.ts`: `indexing_new_reason`,
  `indexing_spike`, `indexed_drop`, `indexing_persistent` (all from the two latest All-known
  imports) and `submitted_not_indexed` (latest inspection of sitemap URLs). `intentional`
  reasons never raise a finding. Fingerprint = rule + property + reason text or URL, so the
  existing dedupe and history apply. Evidence carries source, scope, report dates, counts,
  up to 10 example URLs with the partial flag, and Search Console links. The scan runs after
  each import and refresh, and in the daily scan.
- **Not offered in-app:** validation requests and live URL tests. The UI links to the
  Search Console screen instead.
- **Reports and exports.** Section `indexing` (PDF, CSV `indexing` and `indexing_trend`,
  on-screen preview) prints view, report date, source and a completeness sentence (stale
  report, 1,000-row example cap, inspected vs tracked URLs, quota or permission stops) with
  every block and on every CSV row.

## Addendum (same day): the automatic view is the default

- **Automatic report.** The property page opens on a report rebuilt from URL Inspection alone
  (`IndexingService.liveIndexing`): for each day, the latest inspection of every tracked URL,
  grouped by Google's coverage state. Same layout as Search Console (tiles, chart, "Why pages
  aren't indexed"), no upload. Source (Website / Google systems) is derived from the reason
  text; validation status is not available from the API and shows N/A. The uploaded export
  stays as a second view ("Imported report") and is never added to the automatic numbers.
- **What is tracked.** Sitemap URLs, every page Search Analytics has ever reported (not only
  the last 28 days), URLs added by hand, and the example URLs of imported exports. Pages that
  are in none of these (most 404 and noindex pages Google knows) are not inspected, so
  automatic totals are lower than Search Console's.
- **Runs.** Daily at 05:00, "Refresh all properties" (`POST /indexing/refresh`), and a
  catch-up two minutes after a start for connected properties never inspected. One property
  at a time, `INDEXING_INSPECT_CONCURRENCY` (default 4) inspections in flight.
- **Critical.** Reasons classified `likely_defect` are shown in red and first, on the fleet
  page, the property page and as an alert on the property detail page. "URL is unknown to
  Google" is critical: a tracked URL Google has never seen.
- **Findings.** `submitted_not_indexed` raises one finding per property and coverage state
  with the URL count and up to 10 examples, not one per URL.
- **Reasons table to opportunities (MISS-0194).** `not_indexed_reason` raises one finding
  per property and critical (`likely_defect`) reason for the tracked URLs that are in no
  sitemap. Sitemap URLs stay with `submitted_not_indexed`, so a page is in one finding only.
  Intentional and unknown reasons outside the sitemap raise nothing. The "Why pages aren't
  indexed" table shows, per reason, a link to its open opportunities.
- **Reports.** The `indexing` section prints the automatic block (its own source, date and
  completeness) and, when an export is imported, that report as a separate block.
- **No submit.** Google's API cannot request indexing. The UI links to Search Console
  ("Fix in Search Console", "Request indexing in Search Console").

## Consequences

- Report numbers are as fresh as the last upload. Reports older than 14 days are flagged stale
  in the UI, the fleet table and exports.
- The export parser follows Search Console's current file names and headers (`Chart.csv`,
  `Critical issues.csv`, `Non-critical issues.csv`, `Table.csv`, `Metadata.csv`). If Google
  changes them the upload fails with a message naming the file and column; fixtures in
  `export-parser.spec.ts` are the place to add the new shape.
- MITP-0832 can chart indexing from `GET /properties/:id/indexing` (trend, reasons) and
  `GET /indexing/overview` without new endpoints.
