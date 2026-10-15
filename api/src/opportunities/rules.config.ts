/** Thresholds for every rule. All configurable per workspace (PUT /opportunities/rules). */
export interface RuleConfig {
  /** comparison window in days (current vs the previous window of the same length) */
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
  /** a done item re-triggers only if the finding comes back this many days after completion */
  regression_days: number;
}

export const DEFAULT_RULES: RuleConfig = {
  window_days: 28,
  clicks_drop: { enabled: true, min_previous_clicks: 20, drop_ratio: 0.3 },
  impressions_drop: {
    enabled: true,
    min_previous_impressions: 300,
    drop_ratio: 0.3,
  },
  low_ctr: {
    enabled: true,
    min_impressions: 200,
    max_ctr: 0.015,
    max_position: 10,
  },
  near_page_one: {
    enabled: true,
    min_position: 8,
    max_position: 20,
    min_impressions: 50,
  },
  cannibalization: { enabled: true, min_impressions: 100, min_share: 0.25 },
  regression_days: 14,
};

/** Deep-merge a stored partial over the defaults, ignoring unknown keys and bad types. */
export function mergeRules(partial: unknown): RuleConfig {
  const p = (partial && typeof partial === 'object' ? partial : {}) as Record<
    string,
    unknown
  >;
  const out: RuleConfig = JSON.parse(JSON.stringify(DEFAULT_RULES));
  if (
    typeof p.window_days === 'number' &&
    p.window_days >= 7 &&
    p.window_days <= 90
  )
    out.window_days = Math.round(p.window_days);
  if (
    typeof p.regression_days === 'number' &&
    p.regression_days >= 0 &&
    p.regression_days <= 365
  )
    out.regression_days = Math.round(p.regression_days);
  for (const rule of [
    'clicks_drop',
    'impressions_drop',
    'low_ctr',
    'near_page_one',
    'cannibalization',
  ] as const) {
    const src = p[rule];
    if (!src || typeof src !== 'object') continue;
    const target = out[rule] as unknown as Record<string, number | boolean>;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!(k in target)) continue;
      if (typeof target[k] === 'boolean' && typeof v === 'boolean')
        target[k] = v;
      if (
        typeof target[k] === 'number' &&
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= 0
      )
        target[k] = v;
    }
  }
  return out;
}
