import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import {
  Dimension,
  DIMENSIONS,
  DimensionMetric,
} from '../metrics/entities/dimension-metric.entity';
import { aggregateByKey, coverage, KeyTotals } from '../metrics/dimension.math';
import {
  aggregate,
  daysBetween,
  defaultEndDate,
  delta,
  MetricTotals,
  Period,
  periodEndingOn,
  previousPeriod,
  toIsoDate,
} from '../metrics/metrics.math';
import { Property } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import { parseCoverage, unreliableDimensions } from '../sync/coverage';

export interface PeriodQuery {
  start?: string;
  end?: string;
  days?: number;
}

/**
 * Filters applied server-side. Regular expressions (MySQL REGEXP, ICU) on query / page
 * keys; code lists on country (ISO-3166-1 alpha-3) and device (DESKTOP/MOBILE/TABLET).
 * Stored rows are date × ONE dimension (ADR-0004), so a filter can only be evaluated on
 * the dimension it names: filters on two dimensions at once are rejected (400) instead of
 * silently applying to part of the page.
 */
export interface KeyFilters {
  include_query?: string;
  exclude_query?: string;
  include_page?: string;
  exclude_page?: string;
  /** comma-separated alpha-3 codes */
  country?: string;
  /** comma-separated device names */
  device?: string;
}

export interface ResolvedFilter {
  dimension: Dimension;
  include?: string;
  exclude?: string;
  keys?: string[];
}

const MAX_REGEX_LENGTH = 200;
const MAX_KEYS = 20;
const DEVICES = ['DESKTOP', 'MOBILE', 'TABLET'];

export function validateRegex(
  value: string | undefined,
  label: string,
): string | undefined {
  if (!value) return undefined;
  if (value.length > MAX_REGEX_LENGTH) {
    throw new BadRequestException(
      `${label}: pattern longer than ${MAX_REGEX_LENGTH} characters`,
    );
  }
  try {
    // JS and MySQL (ICU) syntaxes overlap for everyday patterns; this catches unbalanced groups etc.
    new RegExp(value);
  } catch {
    throw new BadRequestException(`${label}: invalid regular expression`);
  }
  return value;
}

function parseKeys(
  value: string | undefined,
  label: 'country' | 'device',
): string[] | undefined {
  if (!value) return undefined;
  const keys = [
    ...new Set(
      value
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => (label === 'country' ? k.toLowerCase() : k.toUpperCase())),
    ),
  ];
  if (!keys.length) return undefined;
  if (keys.length > MAX_KEYS)
    throw new BadRequestException(`${label}: more than ${MAX_KEYS} values`);
  for (const k of keys) {
    if (label === 'country' && !/^[a-z]{3}$/.test(k))
      throw new BadRequestException(
        `${label}: "${k}" is not an ISO-3166-1 alpha-3 code`,
      );
    if (label === 'device' && !DEVICES.includes(k))
      throw new BadRequestException(
        `${label}: "${k}" must be one of ${DEVICES.join(', ')}`,
      );
  }
  return keys;
}

/** Validate and reduce the filter state to the single dimension it addresses (or null). */
export function resolveFilters(f: KeyFilters): ResolvedFilter | null {
  const candidates: ResolvedFilter[] = [];
  const q = {
    include: validateRegex(f.include_query, 'include_query'),
    exclude: validateRegex(f.exclude_query, 'exclude_query'),
  };
  if (q.include || q.exclude) candidates.push({ dimension: 'query', ...q });
  const p = {
    include: validateRegex(f.include_page, 'include_page'),
    exclude: validateRegex(f.exclude_page, 'exclude_page'),
  };
  if (p.include || p.exclude) candidates.push({ dimension: 'page', ...p });
  const country = parseKeys(f.country, 'country');
  if (country) candidates.push({ dimension: 'country', keys: country });
  const device = parseKeys(f.device, 'device');
  if (device) candidates.push({ dimension: 'device', keys: device });
  if (candidates.length > 1) {
    throw new BadRequestException(
      `Filters on ${candidates.map((c) => c.dimension).join(' and ')} cannot be combined: stored data is per dimension, so a cross-dimension filter cannot be evaluated. Clear one of them.`,
    );
  }
  return candidates[0] ?? null;
}

export interface PropertyKpi {
  id: number;
  site_url: string;
  display_name: string;
  status: Property['status'];
  data_since: string | null;
  last_sync_at: Date | null;
  last_sync_status: Property['last_sync_status'];
  current: MetricTotals;
  previous: MetricTotals;
  delta: {
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    position: number | null;
  };
}

export interface DimensionBreakdown {
  rows: KeyTotals[];
  /** filters that were applied to this dimension (echoed back for the UI) */
  filters?: { include?: string; exclude?: string; keys?: string[] };
  /** share of the property's clicks / impressions these rows explain (null when the property has none) */
  coverage: { clicks: number | null; impressions: number | null };
  /** inclusive date range actually present in the stored rows for this period (null = nothing stored) */
  stored: Period | null;
  /** number of distinct days with rows in the period */
  days: number;
  /** set when the breakdown cannot be computed under the active filter */
  unavailable?: { reason: 'cross_dimension'; message: string };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TOP_LIMIT = 500;
const MAX_RANGE_DAYS = 487;

function parseIsoDate(value: string, label: string): string {
  if (!ISO.test(value)) {
    throw new BadRequestException(`${label}: expected YYYY-MM-DD`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || toIsoDate(d) !== value) {
    throw new BadRequestException(`${label}: not a valid calendar date`);
  }
  return value;
}

/** Strict: a malformed or impossible date, inverted or oversized range is a 400, never a silent default. */
export function resolvePeriod(q: PeriodQuery): Period {
  const end =
    q.end !== undefined && q.end !== ''
      ? parseIsoDate(q.end, 'end')
      : defaultEndDate();
  if (q.start !== undefined && q.start !== '') {
    const start = parseIsoDate(q.start, 'start');
    if (start > end) {
      throw new BadRequestException('start must be on or before end');
    }
    if (daysBetween({ start, end }) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `range longer than ${MAX_RANGE_DAYS} days (Search Console keeps 16 months)`,
      );
    }
    return { start, end };
  }
  let days = 28;
  if (q.days !== undefined) {
    if (!Number.isInteger(q.days) || q.days < 1 || q.days > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `days must be an integer between 1 and ${MAX_RANGE_DAYS}`,
      );
    }
    days = q.days;
  }
  return periodEndingOn(end, days);
}

interface DimRow {
  key_text: string;
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

@Injectable()
export class OverviewService {
  constructor(
    @InjectRepository(DailyMetric)
    private readonly daily: Repository<DailyMetric>,
    @InjectRepository(DimensionMetric)
    private readonly dims: Repository<DimensionMetric>,
    private readonly properties: PropertiesService,
  ) {}

  /** Fleet table: one row per property, current vs previous period. */
  async fleet(q: PeriodQuery) {
    const period = resolvePeriod(q);
    const prev = previousPeriod(period);
    const props = await this.properties.list();
    const ids = props.map((p) => p.id);
    const rows = ids.length
      ? await this.daily.find({
          where: { property_id: In(ids) },
          order: { date: 'ASC' },
        })
      : [];
    const inRange = (r: DailyMetric, p: Period) =>
      r.date >= p.start && r.date <= p.end;

    const items: PropertyKpi[] = props.map((p) => {
      const mine = rows.filter((r) => r.property_id === p.id);
      const current = aggregate(mine.filter((r) => inRange(r, period)));
      const previous = aggregate(mine.filter((r) => inRange(r, prev)));
      return {
        id: p.id,
        site_url: p.site_url,
        display_name: p.display_name,
        status: p.status,
        data_since: p.data_since,
        last_sync_at: p.last_sync_at,
        last_sync_status: p.last_sync_status,
        current,
        previous,
        delta: {
          clicks: delta(current.clicks, previous.clicks),
          impressions: delta(current.impressions, previous.impressions),
          ctr: delta(current.ctr, previous.ctr),
          position: delta(current.position, previous.position),
        },
      };
    });
    items.sort((a, b) => b.current.clicks - a.current.clicks);

    const fleetCurrent = aggregate(rows.filter((r) => inRange(r, period)));
    const fleetPrevious = aggregate(rows.filter((r) => inRange(r, prev)));
    const today = new Date().toISOString().slice(0, 10);
    const syncedToday = props.filter(
      (p) =>
        p.last_sync_at && p.last_sync_at.toISOString().slice(0, 10) === today,
    ).length;

    return {
      period,
      previousPeriod: prev,
      totals: {
        current: fleetCurrent,
        previous: fleetPrevious,
        delta: {
          clicks: delta(fleetCurrent.clicks, fleetPrevious.clicks),
          impressions: delta(
            fleetCurrent.impressions,
            fleetPrevious.impressions,
          ),
        },
      },
      coverage: {
        properties: props.length,
        connected: props.filter((p) => p.status === 'connected').length,
        syncedToday,
        partial: props.filter((p) => p.last_sync_status === 'partial').length,
        dataThrough: rows.length ? rows[rows.length - 1].date : null,
      },
      items,
    };
  }

  /** Daily series for the chart: one point per date with per-property clicks + fleet total. */
  async series(q: PeriodQuery) {
    const period = resolvePeriod(q);
    const props = await this.properties.list();
    const ids = props.map((p) => p.id);
    const rows = ids.length
      ? await this.daily
          .createQueryBuilder('d')
          .where('d.property_id IN (:...ids)', { ids })
          .andWhere('d.date BETWEEN :start AND :end', period)
          .orderBy('d.date', 'ASC')
          .getMany()
      : [];
    const byDate = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = String(r.date).slice(0, 10);
      const point = byDate.get(key) ?? { total: 0 };
      point[String(r.property_id)] = r.clicks;
      point.total += r.clicks;
      byDate.set(key, point);
    }
    return {
      period,
      properties: props.map((p) => ({
        id: p.id,
        display_name: p.display_name,
      })),
      points: [...byDate.entries()].map(([date, v]) => ({ date, ...v })),
    };
  }

  /**
   * One property: KPIs, daily series, every dimension aggregated over the period.
   * With a filter, KPIs / series / comparison come from the filtered rows of that dimension
   * (one consistent source for the whole page); breakdowns of other dimensions are marked
   * unavailable. Without a filter everything comes from the daily totals.
   */
  async propertyDetail(
    property: Property,
    q: PeriodQuery,
    filters: KeyFilters = {},
  ) {
    const filter = resolveFilters(filters);
    const period = resolvePeriod(q);
    const prev = previousPeriod(period);

    let current: MetricTotals;
    let previous: MetricTotals;
    let series: {
      date: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }[];
    let previousStoredDays: number;
    let note: string | null = null;

    if (!filter) {
      const rows = await this.daily.find({
        where: { property_id: property.id },
        order: { date: 'ASC' },
      });
      const inRange = (r: DailyMetric, p: Period) =>
        r.date >= p.start && r.date <= p.end;
      current = aggregate(rows.filter((r) => inRange(r, period)));
      const prevRows = rows.filter((r) => inRange(r, prev));
      previous = aggregate(prevRows);
      previousStoredDays = prevRows.length;
      series = rows
        .filter((r) => inRange(r, period))
        .map((r) => ({
          date: String(r.date).slice(0, 10),
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        }));
    } else {
      const cur = await this.dimensionRows(
        property.id,
        filter.dimension,
        period,
        filter,
      );
      const prv = await this.dimensionRows(
        property.id,
        filter.dimension,
        prev,
        filter,
      );
      current = aggregate(cur);
      previous = aggregate(prv);
      previousStoredDays = await this.storedDays(
        property.id,
        filter.dimension,
        prev,
      );
      series = seriesFromRows(cur);
      if (filter.dimension === 'query') {
        note =
          'Totals come from the matching query rows. Google omits low-volume (anonymised) queries from this dimension, so filtered totals are lower than the property total.';
      } else if (filter.dimension === 'page') {
        note =
          'Totals come from the matching page rows (clicks on all queries for those pages).';
      } else {
        note = `Totals come from the selected ${filter.dimension} rows.`;
      }
    }

    const comparison =
      previousStoredDays > 0
        ? { available: true as const }
        : {
            available: false as const,
            reason: 'no_stored_rows' as const,
            message: `No stored ${filter ? filter.dimension : 'daily'} rows for ${prev.start} → ${prev.end}: the comparison is not shown.`,
          };

    const breakdowns: Partial<Record<Dimension, DimensionBreakdown>> = {};
    for (const dimension of DIMENSIONS) {
      if (filter && dimension !== filter.dimension) {
        breakdowns[dimension] = {
          rows: [],
          coverage: { clicks: null, impressions: null },
          stored: null,
          days: 0,
          unavailable: {
            reason: 'cross_dimension',
            message: `Not available while a ${filter.dimension} filter is active: stored rows are per dimension, so ${dimension} rows cannot be restricted to the matching ${filter.dimension} rows.`,
          },
        };
        continue;
      }
      breakdowns[dimension] = await this.breakdown(
        property.id,
        dimension,
        period,
        current,
        filter && filter.dimension === dimension ? filter : undefined,
      );
    }

    const propertyCoverage = parseCoverage(property.coverage);
    return {
      period,
      previousPeriod: prev,
      filters: filter
        ? {
            dimension: filter.dimension,
            include: filter.include,
            exclude: filter.exclude,
            keys: filter.keys,
          }
        : null,
      kpi: {
        source: filter ? filter.dimension : ('property' as const),
        note,
        comparison,
        current,
        previous: comparison.available ? previous : null,
        delta: comparison.available
          ? {
              clicks: delta(current.clicks, previous.clicks),
              impressions: delta(current.impressions, previous.impressions),
              ctr: delta(current.ctr, previous.ctr),
              position: delta(current.position, previous.position),
            }
          : { clicks: null, impressions: null, ctr: null, position: null },
      },
      series,
      breakdowns,
      coverage: {
        last_sync_status: property.last_sync_status,
        detail: propertyCoverage,
        unreliable: unreliableDimensions(propertyCoverage),
      },
    };
  }

  private async dimensionRows(
    propertyId: number,
    dimension: Dimension,
    period: Period,
    filter?: ResolvedFilter,
  ): Promise<DimRow[]> {
    const qb = this.dims
      .createQueryBuilder('m')
      .select([
        'm.key_text AS key_text',
        'm.date AS date',
        'm.clicks AS clicks',
        'm.impressions AS impressions',
        'm.position AS position',
      ])
      .where('m.property_id = :propertyId', { propertyId })
      .andWhere('m.dimension = :dimension', { dimension })
      .andWhere('m.date BETWEEN :start AND :end', period);
    if (filter?.include) {
      qb.andWhere('m.key_text REGEXP :inc', { inc: filter.include });
    }
    if (filter?.exclude) {
      qb.andWhere('m.key_text NOT REGEXP :exc', { exc: filter.exclude });
    }
    if (filter?.keys?.length) {
      qb.andWhere(
        dimension === 'country'
          ? 'LOWER(m.key_text) IN (:...keys)'
          : 'UPPER(m.key_text) IN (:...keys)',
        { keys: filter.keys },
      );
    }
    let rows: DimRow[];
    try {
      rows = await qb.getRawMany<DimRow>();
    } catch (err) {
      // MySQL rejects ICU-invalid patterns at execution time (ER_REGEXP_*)
      const code = (err as { code?: string }).code ?? '';
      if (code.startsWith('ER_REGEXP')) {
        throw new BadRequestException(
          `${dimension} filter: ${(err as Error).message}`,
        );
      }
      throw err;
    }
    return rows.map((r) => ({
      key_text: r.key_text,
      date: String(r.date).slice(0, 10),
      clicks: Number(r.clicks),
      impressions: Number(r.impressions),
      position: Number(r.position),
    }));
  }

  private async storedDays(
    propertyId: number,
    dimension: Dimension,
    period: Period,
  ): Promise<number> {
    const r = await this.dims
      .createQueryBuilder('m')
      .select('COUNT(DISTINCT m.date)', 'n')
      .where('m.property_id = :propertyId', { propertyId })
      .andWhere('m.dimension = :dimension', { dimension })
      .andWhere('m.date BETWEEN :start AND :end', period)
      .getRawOne<{ n: string }>();
    return Number(r?.n ?? 0);
  }

  private async breakdown(
    propertyId: number,
    dimension: Dimension,
    period: Period,
    propertyTotals: MetricTotals,
    filter?: ResolvedFilter,
  ): Promise<DimensionBreakdown> {
    const rows = await this.dimensionRows(
      propertyId,
      dimension,
      period,
      filter,
    );
    const totals = aggregateByKey(rows);
    const dates = new Set(rows.map((r) => r.date));
    const sorted = [...dates].sort();
    const dimTotals = totals.reduce(
      (acc, t) => ({
        clicks: acc.clicks + t.clicks,
        impressions: acc.impressions + t.impressions,
      }),
      { clicks: 0, impressions: 0 },
    );
    return {
      rows: totals.slice(0, TOP_LIMIT),
      filters: filter
        ? {
            include: filter.include,
            exclude: filter.exclude,
            keys: filter.keys,
          }
        : undefined,
      coverage: coverage(dimTotals, propertyTotals),
      stored: sorted.length
        ? { start: sorted[0], end: sorted[sorted.length - 1] }
        : null,
      days: sorted.length,
    };
  }
}

/** Collapse date × key rows into one point per date (position impressions-weighted). */
export function seriesFromRows(rows: DimRow[]) {
  const byDate = new Map<string, DimRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  return [...byDate.keys()].sort().map((date) => {
    const t = aggregate(byDate.get(date)!);
    return {
      date,
      clicks: t.clicks,
      impressions: t.impressions,
      ctr: t.ctr,
      position: t.position,
    };
  });
}
