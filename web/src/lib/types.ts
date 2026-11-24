export type PropertyStatus = "pending" | "connected" | "revoked" | "error";

export interface Period {
  start: string;
  end: string;
}

export interface MetricTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface MetricDelta {
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
}

export interface SyncRun {
  id: number;
  kind: "backfill" | "incremental" | "top" | "indexing";
  status: "running" | "ok" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  rows_upserted: number;
  range_start: string | null;
  range_end: string | null;
  error: string | null;
}

export interface PropertyRow {
  id: number;
  site_url: string;
  display_name: string;
  status: PropertyStatus;
  connected_at: string | null;
  last_checked_at: string | null;
  last_sync_at: string | null;
  data_since: string | null;
  last_error: string | null;
  last_sync_status: "ok" | "partial" | "failed" | null;
  created_at: string;
  syncing?: boolean;
  last_run?: SyncRun | null;
}

export interface PropertyListResponse {
  serviceAccountEmail: string;
  items: PropertyRow[];
}

export interface PropertyKpi {
  id: number;
  site_url: string;
  display_name: string;
  status: PropertyStatus;
  data_since: string | null;
  last_sync_at: string | null;
  last_sync_status: "ok" | "partial" | "failed" | null;
  current: MetricTotals;
  previous: MetricTotals;
  delta: MetricDelta;
}

export interface FleetOverview {
  period: Period;
  previousPeriod: Period;
  totals: {
    current: MetricTotals;
    previous: MetricTotals;
    delta: { clicks: number | null; impressions: number | null };
  };
  coverage: {
    properties: number;
    connected: number;
    syncedToday: number;
    partial: number;
    dataThrough: string | null;
  };
  items: PropertyKpi[];
}

export interface FleetSeries {
  period: Period;
  properties: { id: number; display_name: string }[];
  points: ({ date: string; total: number } & Record<string, number | string>)[];
}

export type Dimension =
  "query" | "page" | "country" | "device" | "search_appearance";

/** One aggregated key (query text, page URL, country code, device, appearance) over the period. */
export interface TopRow {
  id: string;
  key_text: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DimensionBreakdown {
  rows: {
    key: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  filters?: { include?: string; exclude?: string; keys?: string[] };
  coverage: { clicks: number | null; impressions: number | null };
  stored: Period | null;
  days: number;
  unavailable?: { reason: "cross_dimension"; message: string };
}

export interface DimensionCoverage {
  status: "complete" | "truncated" | "failed";
  reason?: "page_cap" | "error";
  error?: string;
  window: Period | null;
  rows: number;
  since_backfill_incomplete: boolean;
}

export interface PropertyCoverage {
  run_id: number;
  kind: string;
  finished_at: string;
  daily: { status: "complete" | "failed"; window: Period | null; rows: number };
  dimensions: Partial<Record<Dimension, DimensionCoverage>>;
}

export interface PropertyDetail {
  property: PropertyRow;
  period: Period;
  previousPeriod: Period;
  filters: {
    dimension: Dimension;
    include?: string;
    exclude?: string;
    keys?: string[];
  } | null;
  kpi: {
    source: Dimension | "property";
    note: string | null;
    comparison:
      | { available: true }
      | { available: false; reason: "no_stored_rows"; message: string };
    current: MetricTotals;
    previous: MetricTotals | null;
    delta: MetricDelta;
  };
  series: {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  breakdowns: Partial<Record<Dimension, DimensionBreakdown>>;
  coverage: {
    last_sync_status: "ok" | "partial" | "failed" | null;
    detail: PropertyCoverage | null;
    unreliable: Dimension[];
  };
}

export interface Settings {
  workspace: { id: number; slug: string; name: string };
  brand: Brand;
  logo: LogoMeta | null;
  /** plain-language list of what is not configured and the fallback used instead */
  branding_missing: string[];
  serviceAccountEmail: string;
  mock: boolean;
  schedule: { accessCheck: string; incrementalSync: string };
}

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; name: string; role: string };
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  /** only on GET/PATCH /auth/me: Monday digest of new opportunities (MISS-0196) */
  weekly_opportunities_email?: boolean;
  created_at: string;
}

export type ViewScope = "fleet" | "property";

export interface SavedView {
  id: number;
  scope: ViewScope;
  property_id: number | null;
  name: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Server-side regex filters on the query / page dimensions. */
export interface KeyFilters {
  include_query?: string;
  exclude_query?: string;
  include_page?: string;
  exclude_page?: string;
  /** comma-separated ISO alpha-3 codes */
  country?: string;
  /** comma-separated DESKTOP / MOBILE / TABLET */
  device?: string;
}

export type OpportunityRule =
  | "clicks_drop"
  | "impressions_drop"
  | "low_ctr"
  | "near_page_one"
  | "cannibalization"
  | "indexing_new_reason"
  | "indexing_spike"
  | "indexed_drop"
  | "submitted_not_indexed"
  | "indexing_persistent"
  | "not_indexed_reason";
export type OpportunityStatus = "open" | "in_progress" | "done" | "dismissed";
export type OpportunityPriority = "low" | "medium" | "high";
export type OpportunitySubject = "property" | "page" | "query";

export interface Opportunity {
  id: number;
  property_id: number;
  rule: OpportunityRule;
  subject: OpportunitySubject;
  key_text: string;
  status: OpportunityStatus;
  priority: OpportunityPriority;
  score: number;
  confidence: "low" | "medium" | "high";
  title: string;
  reason: string;
  suggested_action: string;
  evidence: Record<string, unknown>;
  assignee_id: number | null;
  due_date: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface OpportunityEvent {
  id: number;
  user_id: number | null;
  type:
    | "created"
    | "evidence_updated"
    | "status"
    | "priority"
    | "assignee"
    | "due_date"
    | "note"
    | "ai_prompt_copied";
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface OpportunityImpact {
  completed_on: string;
  window_days: number;
  before: { period: Period; totals: MetricTotals };
  after: {
    period: Period;
    days_available: number;
    totals: MetricTotals | null;
  };
  note: string | null;
}

export interface OpportunityDetail extends Opportunity {
  events: OpportunityEvent[];
  impact: OpportunityImpact | null;
}

export interface OpportunityList {
  items: Opportunity[];
  counts: Record<OpportunityStatus, number>;
  scanning: boolean;
}

export interface RuleConfig {
  window_days: number;
  clicks_drop: {
    enabled: boolean;
    min_previous_clicks: number;
    drop_ratio: number;
  };
  impressions_drop: {
    enabled: boolean;
    min_previous_impressions: number;
    drop_ratio: number;
  };
  low_ctr: {
    enabled: boolean;
    min_impressions: number;
    max_ctr: number;
    max_position: number;
  };
  near_page_one: {
    enabled: boolean;
    min_position: number;
    max_position: number;
    min_impressions: number;
  };
  cannibalization: {
    enabled: boolean;
    min_impressions: number;
    min_share: number;
  };
  indexing_new_reason: { enabled: boolean; min_pages: number };
  indexing_spike: {
    enabled: boolean;
    min_increase_pages: number;
    min_increase_ratio: number;
  };
  indexed_drop: {
    enabled: boolean;
    min_previous_indexed: number;
    drop_ratio: number;
  };
  submitted_not_indexed: { enabled: boolean; min_urls: number };
  not_indexed_reason: { enabled: boolean; min_pages: number };
  indexing_persistent: {
    enabled: boolean;
    min_imports: number;
    min_pages: number;
  };
  regression_days: number;
}

export type ReportSection =
  | "overview"
  | "pages"
  | "queries"
  | "countries"
  | "devices"
  | "search_appearance"
  | "opportunities"
  | "indexing";

export interface ReportConfig {
  period: { days?: number; start?: string; end?: string };
  sections: ReportSection[];
  filters?: KeyFilters;
  limit: number;
  notes?: string;
}

export interface ReportSchedule {
  id: number;
  report_id: number;
  frequency: "weekly" | "monthly";
  day: number;
  hour: number;
  recipients: string[];
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: "sent" | "failed" | "skipped" | null;
  last_error: string | null;
}

export interface ReportTemplate {
  id: number;
  name: string;
  scope: "fleet" | "property";
  property_id: number | null;
  config: ReportConfig;
  created_at: string;
  schedules: ReportSchedule[];
}

export interface ReportDelivery {
  id: number;
  period_key: string;
  status: "sent" | "failed" | "skipped";
  recipients: string[];
  subject: string | null;
  error: string | null;
  created_at: string;
}

export interface WebhookRow {
  id: number;
  name: string;
  url: string;
  secret_hint: string;
  events: string[];
  enabled: boolean;
  last_status: "ok" | "failed" | null;
  last_delivery_at: string | null;
}

export interface WebhookDelivery {
  id: number;
  event: string;
  status: "pending" | "ok" | "failed";
  attempts: number;
  response_status: number | null;
  error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface AlertConfig {
  opportunity_priorities: ("high" | "medium" | "low")[];
  opportunity_rules: string[];
  property_ids: number[];
  sync_failed: boolean;
  property_revoked: boolean;
}

export interface AlertRuleRow {
  id: number;
  name: string;
  channel: "email" | "webhook";
  target: string[] | number;
  config: AlertConfig;
  enabled: boolean;
  last_fired_at: string | null;
}

export interface AlertEventRow {
  id: number;
  rule_id: number;
  kind: string;
  title: string;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  created_at: string;
}

export interface Brand {
  name?: string;
  accent_color?: string;
  footer?: string;
  legal_name?: string;
  trading_name?: string;
  company_number?: string;
  registered_address?: string;
  contact_email?: string;
  website?: string;
}

export interface LogoMeta {
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  bytes: number;
}

/** GET /reports/:id/data (api/src/reports/reports.service.ts ReportData). */
export interface ReportTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ReportData {
  report_id: number;
  title: string;
  scope: "fleet" | "property";
  property: { id: number; display_name: string; site_url: string } | null;
  generated_at: string;
  data_through: string | null;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  notes: string | null;
  overview: {
    current: ReportTotals;
    previous: ReportTotals;
    delta: {
      clicks: number | null;
      impressions: number | null;
      ctr: number | null;
      position: number | null;
    };
    comparison_available?: boolean;
    note?: string | null;
    properties?: {
      id: number;
      display_name: string;
      current: ReportTotals;
      previous: ReportTotals;
      delta: { clicks: number | null; impressions: number | null };
    }[];
  } | null;
  tables: {
    section: ReportSection;
    title: string;
    keyLabel: string;
    note: string | null;
    rows: (ReportTotals & { key: string })[];
  }[];
  opportunities:
    | {
        id: number;
        priority: string;
        title: string;
        property: string;
        confidence: string;
        rule: string;
      }[]
    | null;
  /** Page indexing section (MITP-0833): absent on reports without it */
  indexing?: {
    blocks: IndexingReportBlock[];
    opportunities: {
      id: number;
      priority: string;
      title: string;
      property: string;
      confidence: string;
      rule: string;
    }[];
  } | null;
}

// ---- Page indexing (MITP-0833) ---------------------------------------------

export type IndexingScope = "all_known" | "submitted" | "sitemap";
export type ReasonIntent = "likely_defect" | "intentional" | "review";
export type ReasonGroup = "not_indexed" | "indexed" | "improvement";

export interface IndexingPropertyRef {
  id: number;
  site_url: string;
  display_name: string;
}

export interface IndexingScopeRef {
  scope: IndexingScope;
  scope_detail: string | null;
}

export interface IndexingReasonRow {
  reason: string;
  reason_hash: string;
  source: string | null;
  group: ReasonGroup;
  intent: ReasonIntent;
  validation: string | null;
  pages: number;
  previous_pages: number | null;
  is_new: boolean;
  first_seen: string;
  has_examples: boolean;
  /** pages in each imported report, oldest first */
  trend?: { date: string; pages: number }[];
}

/** Page indexing rebuilt from URL Inspection results: automatic, tracked URLs only. */
export interface LiveIndexing {
  source: "url_inspection_api";
  last_update: string | null;
  tracked_urls: number;
  inspected_urls: number;
  totals: { indexed: number; not_indexed: number } | null;
  trend: IndexingTrendPoint[];
  reasons: {
    reason: string;
    reason_hash: string;
    source: string;
    group: "indexed" | "not_indexed";
    intent: ReasonIntent;
    validation: string | null;
    pages: number;
    trend: { date: string; pages: number }[];
    /** open or in-progress opportunities raised from this reason */
    opportunities?: {
      id: number;
      rule: OpportunityRule;
      status: OpportunityStatus;
    }[];
  }[];
}

export interface IndexingTrendPoint {
  date: string;
  indexed: number | null;
  not_indexed: number | null;
  impressions: number | null;
}

export interface IndexingImportRow {
  id: number;
  report_kind: "overview" | "issue";
  scope: IndexingScope;
  scope_detail: string | null;
  issue_reason: string | null;
  report_date: string;
  filename: string;
  reason_rows: number;
  example_rows: number;
  examples_partial: boolean;
  created_at: string;
}

export interface IndexingSitemap {
  path: string;
  last_submitted: string | null;
  last_downloaded: string | null;
  is_pending: boolean;
  warnings: number;
  errors: number;
  contents: { type?: string; submitted?: number | string }[];
  urls_read: number | null;
  urls_truncated: boolean;
  fetch_error: string | null;
  fetched_at: string;
}

export interface IndexingInspectionSummary {
  inspected_urls: number;
  indexed_urls: number;
  tracked_urls: number;
  by_coverage: {
    coverage_state: string;
    verdict: string | null;
    urls: number;
  }[];
  daily_budget: number;
  used_today: number;
  running: boolean;
  last_run: {
    status: "running" | "ok" | "partial" | "failed";
    started_at: string;
    finished_at: string | null;
    error: string | null;
    stop_reason: "quota" | "permission_denied" | null;
    details: Record<string, unknown> | null;
  } | null;
  sitemaps: IndexingSitemap[];
  source: "url_inspection_api";
}

export interface PropertyIndexing {
  property: IndexingPropertyRef;
  scope: IndexingScopeRef;
  scopes: (IndexingScopeRef & {
    scope_hash: string;
    last_report_date: string;
  })[];
  report: {
    import_id: number;
    report_date: string;
    filename: string;
    imported_at: string;
    stale: boolean;
    days_old: number;
    source: "gsc_export";
  } | null;
  totals: {
    date: string;
    indexed: number | null;
    not_indexed: number | null;
    previous_indexed: number | null;
    previous_not_indexed: number | null;
    previous_date: string | null;
  } | null;
  trend: IndexingTrendPoint[];
  reasons: IndexingReasonRow[];
  imports: IndexingImportRow[];
  inspection: IndexingInspectionSummary;
  live: LiveIndexing;
  links: { search_console: string };
}

export interface IndexingReasonDetail {
  property: IndexingPropertyRef;
  scope: IndexingScopeRef;
  reason: string;
  reason_hash: string;
  intent: ReasonIntent;
  source: string | null;
  group: ReasonGroup | null;
  history: { report_date: string; pages: number; validation: string | null }[];
  first_seen: string | null;
  issue_export: {
    import_id: number;
    report_date: string;
    examples_partial: boolean;
    example_rows: number;
  } | null;
  trend: { date: string; pages: number | null }[];
  examples: {
    url: string;
    last_crawled: string | null;
    inspect_link: string;
  }[];
  links: { search_console: string };
}

export interface IndexingUrlRow {
  url: string;
  url_hash: string;
  in_sitemap: number | boolean;
  sitemap: string | null;
  in_gsc_pages: number | boolean;
  impressions_28d: number | null;
  user_added: number | boolean;
  last_inspected_at: string | null;
  inspected_at: string | null;
  verdict: string | null;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_txt_state: string | null;
  page_fetch_state: string | null;
  last_crawl_time: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  error: string | null;
}

export interface IndexingUrlList {
  total: number;
  page: number;
  page_size: number;
  items: IndexingUrlRow[];
  source: "url_inspection_api";
}

export interface IndexingUrlDetail {
  property: IndexingPropertyRef;
  url: string;
  url_hash: string;
  tracked: {
    in_sitemap: boolean;
    sitemap: string | null;
    in_gsc_pages: boolean;
    impressions_28d: number | null;
    user_added: boolean;
    last_inspected_at: string | null;
  } | null;
  latest: {
    inspected_at: string;
    verdict: string | null;
    coverage_state: string | null;
    indexing_state: string | null;
    robots_txt_state: string | null;
    page_fetch_state: string | null;
    crawled_as: string | null;
    last_crawl_time: string | null;
    google_canonical: string | null;
    user_canonical: string | null;
    sitemaps: string[] | null;
    referring_urls: string[] | null;
    raw: unknown;
    error: string | null;
  } | null;
  history: {
    inspected_at: string;
    verdict: string | null;
    coverage_state: string | null;
    last_crawl_time: string | null;
    google_canonical: string | null;
    error: string | null;
  }[];
  links: { inspect: string };
  source: "url_inspection_api";
}

export interface IndexingLiveCheck {
  url: string;
  checked_at: string;
  final_url?: string;
  final_status?: number | null;
  hops: { url: string; status: number; location: string | null }[];
  robots?: string | null;
  canonical?: string | null;
  ms?: number;
  error?: string;
  note?: string;
  source: "live_http";
}

export interface IndexingFleetRow {
  property: IndexingPropertyRef & { status: PropertyStatus };
  /** automatic view (URL Inspection of tracked URLs); null until the first refresh */
  live: {
    indexed: number;
    not_indexed: number;
    critical: number;
    top_critical: { reason: string; pages: number } | null;
  } | null;
  report_date: string | null;
  stale: boolean | null;
  indexed: number | null;
  not_indexed: number | null;
  previous_indexed: number | null;
  previous_not_indexed: number | null;
  defect_pages: number;
  top_defect: { reason: string; pages: number; reason_hash: string } | null;
  inspected_urls: number;
  indexed_urls: number;
  tracked_urls: number;
  running: boolean;
  last_inspection_run: string | null;
  last_run_status: "running" | "ok" | "partial" | "failed" | null;
  stop_reason: "quota" | "permission_denied" | null;
  sitemaps: number;
}

export interface IndexingFleet {
  items: IndexingFleetRow[];
  stale_days: number;
  /** not-indexed URLs of all properties by Google reason (URL Inspection) */
  reasons: { reason: string; pages: number; intent: ReasonIntent }[];
  /** "Refresh all" or the daily job in progress */
  batch: { total: number; done: number; started_at: string } | null;
  daily_budget: number;
}

export interface IndexingImportResult {
  import: IndexingImportRow & { trend_rows: number };
  replaced: boolean;
  opportunities: {
    findings: number;
    created: number;
    updated: number;
    skipped: number;
  } | null;
}

export interface IndexingReportBlock {
  property: IndexingPropertyRef;
  view: string;
  source: string;
  report_date: string | null;
  stale: boolean;
  days_old: number | null;
  completeness: string;
  totals: {
    indexed: number | null;
    not_indexed: number | null;
    previous_indexed: number | null;
    previous_not_indexed: number | null;
    previous_date: string | null;
  } | null;
  reasons: {
    reason: string;
    source: string | null;
    group: string;
    intent: string;
    validation: string | null;
    pages: number;
    previous_pages: number | null;
    first_seen: string;
  }[];
  trend: { date: string; indexed: number | null; not_indexed: number | null }[];
  inspection: {
    tracked_urls: number;
    inspected_urls: number;
    indexed_urls: number;
    last_run_at: string | null;
    last_run_status: string | null;
    stop_reason: string | null;
  };
  /** automatic view (URL Inspection); a separate source from the imported report */
  live: {
    source: string;
    last_update: string;
    completeness: string;
    indexed: number;
    not_indexed: number;
    reasons: {
      reason: string;
      source: string;
      intent: string;
      pages: number;
    }[];
  } | null;
}
