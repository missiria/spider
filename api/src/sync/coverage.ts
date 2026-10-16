import { Dimension } from '../metrics/entities/dimension-metric.entity';
import { Period } from '../metrics/metrics.math';

/**
 * Completeness of what is stored for a property (ADR-0008). Freshness (last_sync_at) says
 * when we last fetched; coverage says whether that fetch brought everything Google offered.
 * Three distinct causes are reported:
 *  - 'page_cap'  : our pagination stopped at the safety cap, rows beyond it are missing
 *  - 'error'     : the fetch for this dimension failed, stored rows are from an earlier run
 *  - API omission (Google hides low-volume queries) is NOT a coverage problem: it shows up
 *    as the breakdown coverage ratio, not here.
 */
export type DimensionCoverageStatus = 'complete' | 'truncated' | 'failed';

export interface DimensionCoverage {
  status: DimensionCoverageStatus;
  reason?: 'page_cap' | 'error';
  error?: string;
  /** window the last run attempted for this dimension */
  window: Period | null;
  rows: number;
  /**
   * true while any run since the last fully complete backfill was truncated or failed for
   * this dimension: comparisons against older dates may be built on missing rows. Reset
   * only when a backfill completes for the dimension.
   */
  since_backfill_incomplete: boolean;
}

export interface PropertyCoverage {
  run_id: number;
  kind: string;
  finished_at: string;
  daily: { status: 'complete' | 'failed'; window: Period | null; rows: number };
  dimensions: Partial<Record<Dimension, DimensionCoverage>>;
}

export function parseCoverage(raw: string | null): PropertyCoverage | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PropertyCoverage;
  } catch {
    return null;
  }
}

/** Dimensions whose stored rows should not back a reliable comparison right now. */
export function unreliableDimensions(c: PropertyCoverage | null): Dimension[] {
  if (!c) return [];
  return (Object.keys(c.dimensions) as Dimension[]).filter((d) => {
    const v = c.dimensions[d];
    return !!v && (v.status !== 'complete' || v.since_backfill_incomplete);
  });
}
