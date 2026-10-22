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
  kind: "backfill" | "incremental" | "top";
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
  | "cannibalization";
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
    | "note";
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
  regression_days: number;
}

export type ReportSection =
  | "overview"
  | "pages"
  | "queries"
  | "countries"
  | "devices"
  | "search_appearance"
  | "opportunities";

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
}
