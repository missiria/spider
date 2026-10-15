import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { TopRow } from '../metrics/entities/top-row.entity';
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

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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
    @InjectRepository(TopRow) private readonly top: Repository<TopRow>,
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
    const syncedToday = props.filter(
      (p) => p.last_sync_at && p.last_sync_at.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
    ).length;

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

  /** One property: KPIs, daily series, top pages / queries for the period. */
  async propertyDetail(property: Property, q: PeriodQuery) {
    const period = resolvePeriod(q);
    const prev = previousPeriod(period);
    const rows = await this.daily.find({
      where: { property_id: property.id },
      order: { date: 'ASC' },
    });
    const inRange = (r: DailyMetric, p: Period) => r.date >= p.start && r.date <= p.end;
    const current = aggregate(rows.filter((r) => inRange(r, period)));
    const previous = aggregate(rows.filter((r) => inRange(r, prev)));

    const topRows = await this.top.find({
      where: { property_id: property.id },
      order: { clicks: 'DESC', impressions: 'DESC' },
    });
    // top rows are stored for the sync's own 28d window; expose that window honestly
    const topPeriod = topRows[0]
      ? { start: topRows[0].period_start, end: topRows[0].period_end }
      : null;

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
      topPeriod,
      topPages: topRows.filter((r) => r.dimension === 'page').slice(0, 50),
      topQueries: topRows.filter((r) => r.dimension === 'query').slice(0, 50),
    };
  }
}
