import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { Dimension, DIMENSIONS, DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { aggregateByKey, coverage, KeyTotals } from '../metrics/dimension.math';
import {
  aggregate,
  defaultEndDate,
  delta,
  MetricTotals,
  Period,
  periodEndingOn,
  previousPeriod,
} from '../metrics/metrics.math';
import { Property } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';

export interface PeriodQuery {
  start?: string;
  end?: string;
  days?: number;
}

/** Include / exclude regular expressions applied server-side to query and page keys (MySQL REGEXP, ICU). */
export interface KeyFilters {
  include_query?: string;
  exclude_query?: string;
  include_page?: string;
  exclude_page?: string;
}

const MAX_REGEX_LENGTH = 200;

export function validateRegex(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (value.length > MAX_REGEX_LENGTH) {
    throw new BadRequestException(`${label}: pattern longer than ${MAX_REGEX_LENGTH} characters`);
  }
  try {
    // JS and MySQL (ICU) syntaxes overlap for everyday patterns; this catches unbalanced groups etc.
    new RegExp(value);
  } catch {
    throw new BadRequestException(`${label}: invalid regular expression`);
  }
  return value;
}

export interface PropertyKpi {
  id: number;
  site_url: string;
  display_name: string;
  status: Property['status'];
  data_since: string | null;
  last_sync_at: Date | null;
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
  /** regex filters that were applied to this dimension (echoed back for the UI) */
  filters?: { include?: string; exclude?: string };
  /** share of the property's clicks / impressions these rows explain (null when the property has none) */
  coverage: { clicks: number | null; impressions: number | null };
  /** inclusive date range actually present in the stored rows for this period (null = nothing stored) */
  stored: Period | null;
  /** number of distinct days with rows in the period */
  days: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TOP_LIMIT = 500;

export function resolvePeriod(q: PeriodQuery): Period {
  const end = q.end && ISO.test(q.end) ? q.end : defaultEndDate();
  if (q.start && ISO.test(q.start) && q.start <= end) {
    return { start: q.start, end };
  }
  const days = q.days && q.days > 0 && q.days <= 487 ? q.days : 28;
  return periodEndingOn(end, days);
}

@Injectable()
export class OverviewService {
  constructor(
    @InjectRepository(DailyMetric) private readonly daily: Repository<DailyMetric>,
    @InjectRepository(DimensionMetric) private readonly dims: Repository<DimensionMetric>,
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
    const inRange = (r: DailyMetric, p: Period) => r.date >= p.start && r.date <= p.end;

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
    const syncedToday = props.filter((p) => p.last_sync_at && p.last_sync_at.toISOString().slice(0, 10) === today).length;

    return {
      period,
      previousPeriod: prev,
      totals: {
        current: fleetCurrent,
        previous: fleetPrevious,
        delta: {
          clicks: delta(fleetCurrent.clicks, fleetPrevious.clicks),
          impressions: delta(fleetCurrent.impressions, fleetPrevious.impressions),
        },
      },
      coverage: {
        properties: props.length,
        connected: props.filter((p) => p.status === 'connected').length,
        syncedToday,
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
      properties: props.map((p) => ({ id: p.id, display_name: p.display_name })),
      points: [...byDate.entries()].map(([date, v]) => ({ date, ...v })),
    };
  }

  /** One property: KPIs, daily series, every dimension aggregated over the period. */
  async propertyDetail(property: Property, q: PeriodQuery, filters: KeyFilters = {}) {
    const keyFilters: Partial<Record<Dimension, { include?: string; exclude?: string }>> = {
      query: {
        include: validateRegex(filters.include_query, 'include_query'),
        exclude: validateRegex(filters.exclude_query, 'exclude_query'),
      },
      page: {
        include: validateRegex(filters.include_page, 'include_page'),
        exclude: validateRegex(filters.exclude_page, 'exclude_page'),
      },
    };
    const period = resolvePeriod(q);
    const prev = previousPeriod(period);
    const rows = await this.daily.find({
      where: { property_id: property.id },
      order: { date: 'ASC' },
    });
    const inRange = (r: DailyMetric, p: Period) => r.date >= p.start && r.date <= p.end;
    const current = aggregate(rows.filter((r) => inRange(r, period)));
    const previous = aggregate(rows.filter((r) => inRange(r, prev)));

    const breakdowns: Partial<Record<Dimension, DimensionBreakdown>> = {};
    for (const dimension of DIMENSIONS) {
      breakdowns[dimension] = await this.breakdown(property.id, dimension, period, current, keyFilters[dimension]);
    }

    return {
      period,
      previousPeriod: prev,
      kpi: {
        current,
        previous,
        delta: {
          clicks: delta(current.clicks, previous.clicks),
          impressions: delta(current.impressions, previous.impressions),
          ctr: delta(current.ctr, previous.ctr),
          position: delta(current.position, previous.position),
        },
      },
      series: rows
        .filter((r) => inRange(r, period))
        .map((r) => ({
          date: String(r.date).slice(0, 10),
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
      breakdowns,
    };
  }

  private async breakdown(
    propertyId: number,
    dimension: Dimension,
    period: Period,
    propertyTotals: MetricTotals,
    keyFilter?: { include?: string; exclude?: string },
  ): Promise<DimensionBreakdown> {
    const qb = this.dims
      .createQueryBuilder('m')
      .select(['m.key_text AS key_text', 'm.date AS date', 'm.clicks AS clicks', 'm.impressions AS impressions', 'm.position AS position'])
      .where('m.property_id = :propertyId', { propertyId })
      .andWhere('m.dimension = :dimension', { dimension })
      .andWhere('m.date BETWEEN :start AND :end', period);
    if (keyFilter?.include) {
      qb.andWhere('m.key_text REGEXP :inc', { inc: keyFilter.include });
    }
    if (keyFilter?.exclude) {
      qb.andWhere('m.key_text NOT REGEXP :exc', { exc: keyFilter.exclude });
    }
    let rows: { key_text: string; date: string; clicks: number; impressions: number; position: number }[];
    try {
      rows = await qb.getRawMany();
    } catch (err) {
      // MySQL rejects ICU-invalid patterns at execution time (ER_REGEXP_*)
      const code = (err as { code?: string }).code ?? '';
      if (code.startsWith('ER_REGEXP')) {
        throw new BadRequestException(`${dimension} filter: ${(err as Error).message}`);
      }
      throw err;
    }

    const totals = aggregateByKey(
      rows.map((r) => ({
        key_text: r.key_text,
        clicks: Number(r.clicks),
        impressions: Number(r.impressions),
        position: Number(r.position),
      })),
    );
    const dates = new Set(rows.map((r) => String(r.date).slice(0, 10)));
    const sorted = [...dates].sort();
    const dimTotals = totals.reduce(
      (acc, t) => ({ clicks: acc.clicks + t.clicks, impressions: acc.impressions + t.impressions }),
      { clicks: 0, impressions: 0 },
    );
    const applied = keyFilter && (keyFilter.include || keyFilter.exclude) ? { include: keyFilter.include, exclude: keyFilter.exclude } : undefined;
    return {
      rows: totals.slice(0, TOP_LIMIT),
      filters: applied,
      coverage: coverage(dimTotals, propertyTotals),
      stored: sorted.length ? { start: sorted[0], end: sorted[sorted.length - 1] } : null,
      days: sorted.length,
    };
  }
}
