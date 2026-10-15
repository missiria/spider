import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { GscService } from '../gsc/gsc.service';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { TopDimension, TopRow } from '../metrics/entities/top-row.entity';
import { Property } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import {
  addDays,
  defaultEndDate,
  Period,
  periodEndingOn,
} from '../metrics/metrics.math';
import { SyncKind, SyncRun } from './entities/sync-run.entity';

/** GSC keeps 16 months; 487 days fits in one 25k-row call. */
const BACKFILL_DAYS = 487;
/** GSC finalises late rows for a few days; re-sync this many days each run. */
const INCREMENTAL_DAYS = 10;
const TOP_ROW_LIMIT = 500;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly inFlight = new Set<number>();

  constructor(
    @InjectRepository(DailyMetric) private readonly daily: Repository<DailyMetric>,
    @InjectRepository(TopRow) private readonly top: Repository<TopRow>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    private readonly gsc: GscService,
    private readonly properties: PropertiesService,
  ) {}

  /** Full history (16 months of daily totals) + top rows for the default period. */
  backfill(property: Property): Promise<SyncRun> {
    const end = defaultEndDate();
    return this.syncDaily(property, 'backfill', {
      start: addDays(end, -(BACKFILL_DAYS - 1)),
      end,
    });
  }

  /** Last 10 days + top rows; cheap, run daily. */
  incremental(property: Property): Promise<SyncRun> {
    const end = defaultEndDate();
    return this.syncDaily(property, 'incremental', periodEndingOn(end, INCREMENTAL_DAYS));
  }

  isRunning(propertyId: number): boolean {
    return this.inFlight.has(propertyId);
  }

  async latestRun(propertyId: number): Promise<SyncRun | null> {
    return this.runs.findOne({
      where: { property_id: propertyId },
      order: { started_at: 'DESC', id: 'DESC' },
    });
  }

  private async syncDaily(
    property: Property,
    kind: SyncKind,
    range: Period,
  ): Promise<SyncRun> {
    if (this.inFlight.has(property.id)) {
      throw new Error('A sync is already running for this property');
    }
    this.inFlight.add(property.id);
    const run = await this.runs.save(
      this.runs.create({
        property_id: property.id,
        kind,
        status: 'running',
        range_start: range.start,
        range_end: range.end,
      }),
    );

    try {
      const rows = await this.gsc.query(property.site_url, range.start, range.end, ['date']);
      const entities = rows.map((r) =>
        this.daily.create({
          property_id: property.id,
          date: r.keys[0],
          clicks: Math.round(r.clicks),
          impressions: Math.round(r.impressions),
          ctr: r.ctr,
          position: r.position,
        }),
      );
      for (const chunk of chunks(entities, 500)) {
        await this.daily.upsert(chunk, ['property_id', 'date']);
      }

      const topRows = await this.refreshTop(property, periodEndingOn(range.end, 28));

      const firstDate = await this.daily
        .createQueryBuilder('d')
        .select('MIN(d.date)', 'min')
        .where('d.property_id = :id', { id: property.id })
        .getRawOne<{ min: string | null }>();

      property.last_sync_at = new Date();
      property.last_error = null;
      property.data_since = firstDate?.min ? String(firstDate.min).slice(0, 10) : null;
      if (property.status === 'error') {
        property.status = 'connected';
      }
      await this.properties.save(property);

      run.status = 'ok';
      run.rows_upserted = entities.length + topRows;
      run.finished_at = new Date();
      this.logger.log(
        `${kind} ${property.site_url}: ${entities.length} daily rows, ${topRows} top rows`,
      );
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      run.status = 'failed';
      run.error = message;
      run.finished_at = new Date();
      property.last_error = `${kind} failed: ${message}`;
      await this.properties.save(property);
      this.logger.error(`${kind} ${property.site_url} failed: ${message}`);
    } finally {
      this.inFlight.delete(property.id);
    }
    return this.runs.save(run);
  }

  /** Top pages + top queries for a period; replaces the stored set for that period. */
  async refreshTop(property: Property, period: Period): Promise<number> {
    let total = 0;
    for (const dimension of ['page', 'query'] as TopDimension[]) {
      const rows = await this.gsc.query(
        property.site_url,
        period.start,
        period.end,
        [dimension],
        TOP_ROW_LIMIT,
      );
      await this.top.delete({
        property_id: property.id,
        period_start: period.start,
        period_end: period.end,
        dimension,
      });
      const entities = rows.map((r) =>
        this.top.create({
          property_id: property.id,
          period_start: period.start,
          period_end: period.end,
          dimension,
          key_text: r.keys[0].slice(0, 2048),
          key_hash: createHash('md5').update(r.keys[0]).digest('hex'),
          clicks: Math.round(r.clicks),
          impressions: Math.round(r.impressions),
          ctr: r.ctr,
          position: r.position,
        }),
      );
      for (const chunk of chunks(entities, 500)) {
        await this.top.upsert(chunk, [
          'property_id',
          'period_start',
          'period_end',
          'dimension',
          'key_hash',
        ]);
      }
      total += entities.length;
    }
    return total;
  }
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}
