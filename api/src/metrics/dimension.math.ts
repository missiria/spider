/** Aggregation of date × dimension rows over a period (pure, unit-tested). */

export interface DimRow {
  key_text: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface KeyTotals {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Sum rows per key; CTR = Σclicks/Σimpressions; position = impressions-weighted mean. */
export function aggregateByKey(rows: DimRow[]): KeyTotals[] {
  const acc = new Map<
    string,
    { clicks: number; impressions: number; weighted: number }
  >();
  for (const r of rows) {
    const a = acc.get(r.key_text) ?? { clicks: 0, impressions: 0, weighted: 0 };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.weighted += r.position * r.impressions;
    acc.set(r.key_text, a);
  }
  return [...acc.entries()]
    .map(([key, a]) => ({
      key,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
      position: a.impressions > 0 ? a.weighted / a.impressions : 0,
    }))
    .sort(
      (x, y) =>
        y.clicks - x.clicks ||
        y.impressions - x.impressions ||
        x.key.localeCompare(y.key),
    );
}

/**
 * Share of the property's total clicks/impressions that the dimension rows explain.
 * GSC omits anonymised (low-volume) queries, so the query share is usually < 1.
 */
export function coverage(
  dimensionTotals: { clicks: number; impressions: number },
  propertyTotals: { clicks: number; impressions: number },
): { clicks: number | null; impressions: number | null } {
  return {
    clicks:
      propertyTotals.clicks > 0
        ? dimensionTotals.clicks / propertyTotals.clicks
        : null,
    impressions:
      propertyTotals.impressions > 0
        ? dimensionTotals.impressions / propertyTotals.impressions
        : null,
  };
}
