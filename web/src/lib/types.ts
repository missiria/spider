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
  status: "running" | "ok" | "failed";
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
    dataThrough: string | null;
  };
  items: PropertyKpi[];
}

export interface FleetSeries {
  period: Period;
  properties: { id: number; display_name: string }[];
  points: ({ date: string; total: number } & Record<string, number | string>)[];
}

export type Dimension = "query" | "page" | "country" | "device" | "search_appearance";

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
  rows: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  filters?: { include?: string; exclude?: string };
  coverage: { clicks: number | null; impressions: number | null };
  stored: Period | null;
  days: number;
}

export interface PropertyDetail {
  property: PropertyRow;
  period: Period;
  previousPeriod: Period;
  kpi: { current: MetricTotals; previous: MetricTotals; delta: MetricDelta };
  series: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  breakdowns: Partial<Record<Dimension, DimensionBreakdown>>;
}

export interface Settings {
  workspace: { id: number; slug: string; name: string };
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
}

export type OpportunityRule = "clicks_drop" | "impressions_drop" | "low_ctr" | "near_page_one" | "cannibalization";
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
  type: "created" | "evidence_updated" | "status" | "priority" | "assignee" | "due_date" | "note";
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface OpportunityImpact {
  completed_on: string;
  window_days: number;
  before: { period: Period; totals: MetricTotals };
  after: { period: Period; days_available: number; totals: MetricTotals | null };
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
  clicks_drop: { enabled: boolean; min_previous_clicks: number; drop_ratio: number };
  impressions_drop: { enabled: boolean; min_previous_impressions: number; drop_ratio: number };
  low_ctr: { enabled: boolean; min_impressions: number; max_ctr: number; max_position: number };
  near_page_one: { enabled: boolean; min_position: number; max_position: number; min_impressions: number };
  cannibalization: { enabled: boolean; min_impressions: number; min_share: number };
  regression_days: number;
}
