import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { GscDimension, GscPagedResult, GscService } from '../gsc/gsc.service';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import {
  Dimension,
  DimensionMetric,
} from '../metrics/entities/dimension-metric.entity';
import { Property } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import {
  addDays,
  defaultEndDate,
  Period,
  periodEndingOn,
} from '../metrics/metrics.math';
import { DimensionCoverage, parseCoverage, PropertyCoverage } from './coverage';
import { SyncKind, SyncRun } from './entities/sync-run.entity';

/** GSC keeps 16 months; 487 days of daily totals fit in one 25k-row call. */
const BACKFILL_DAYS = 487;
/** GSC finalises late rows for a few days; re-sync this many days each run. */
const INCREMENTAL_DAYS = 10;
/** Date×dimension rows are requested in chunks of this many days (then paginated). */
const CHUNK_DAYS = 31;

/** Which stored dimension maps to which API dimension. */
const DIMENSION_API: Record<
  Exclude<Dimension, 'search_appearance'>,
  GscDimension
> = {
  query: 'query',
  page: 'page',
  country: 'country',
  device: 'device',
};

export interface DimensionRunDetail {
  rows: number;
  calls: number;
  truncated: boolean;
  days: number;
  /** windows (chunks) whose rows were fully fetched and reconciled */
  complete_windows: Period[];
  /** windows where pagination hit the cap: stored rows for them are incomplete */
  truncated_windows: Period[];
  error?: string;
}

export interface RunDetails {
  daily: { rows: number; calls: number; error?: string };
  dimensions: Partial<Record<Dimension, DimensionRunDetail>>;
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private readonly inFlight = new Set<number>();
  /** How far back date×dimension rows are backfilled (daily totals always go 16 months). */
  private readonly dimensionBackfillDays: number;
  /** searchAppearance costs one call per day: keep its backfill shorter. */
  private readonly appearanceBackfillDays: number;

  constructor(
    @InjectRepository(DailyMetric)
    private readonly daily: Repository<DailyMetric>,
    @InjectRepository(DimensionMetric)
    private readonly dims: Repository<DimensionMetric>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    private readonly gsc: GscService,
    private readonly properties: PropertiesService,
    config: ConfigService,
  ) {
    this.dimensionBackfillDays = clampInt(
      config.get('GSC_DIMENSION_BACKFILL_DAYS'),
      90,
      1,
      BACKFILL_DAYS,
    );
    this.appearanceBackfillDays = clampInt(
      config.get('GSC_APPEARANCE_BACKFILL_DAYS'),
      28,
      1,
      BACKFILL_DAYS,
    );
  }

  /** Runs left 'running' by a crash or restart can never finish: mark them. */
  async onModuleInit(): Promise<void> {
    const stale = await this.runs.update(
      { status: 'running' },
      {
        status: 'failed',
        error: 'Interrupted by an API restart',
        finished_at: new Date(),
      },
    );
    if (stale.affected) {
      this.logger.warn(
        `${stale.affected} interrupted sync run(s) marked failed`,
      );
    }
  }

  /** Full history: 16 months of daily totals + N days of every dimension. */
  backfill(property: Property): Promise<SyncRun> {
    const end = defaultEndDate();
    return this.run(property, 'backfill', {
      daily: { start: addDays(end, -(BACKFILL_DAYS - 1)), end },
      dimensions: periodEndingOn(end, this.dimensionBackfillDays),
      appearance: periodEndingOn(end, this.appearanceBackfillDays),
    });
  }

  /** Last 10 days for everything; cheap, run daily. */
  incremental(property: Property): Promise<SyncRun> {
    const end = defaultEndDate();
    const window = periodEndingOn(end, INCREMENTAL_DAYS);
    return this.run(property, 'incremental', {
      daily: window,
      dimensions: window,
      appearance: window,
    });
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

  /**
   * One run = daily totals, then every dimension. Outcome:
   *  - ok      : everything fetched completely
   *  - partial : daily totals stored, but a dimension hit the page cap or failed
   *  - failed  : daily totals could not be fetched (nothing about the run is trustworthy)
   * The in-flight lock is released on every path, including a failure to insert the run row.
   */
  private async run(
    property: Property,
    kind: SyncKind,
    ranges: { daily: Period; dimensions: Period; appearance: Period },
  ): Promise<SyncRun> {
    if (this.inFlight.has(property.id)) {
      throw new Error('A sync is already running for this property');
    }
    this.inFlight.add(property.id);
    let run: SyncRun;
    try {
      run = await this.runs.save(
        this.runs.create({
          property_id: property.id,
          kind,
          status: 'running',
          range_start: ranges.daily.start,
          range_end: ranges.daily.end,
        }),
      );
    } catch (err) {
      this.inFlight.delete(property.id);
      throw err;
    }
    const details: RunDetails = {
      daily: { rows: 0, calls: 0 },
      dimensions: {},
    };

    try {
      // 1. daily totals — one call, never paginated (≤ 487 rows): a success is a complete window
      const dailyRows = await this.gsc.query(
        property.site_url,
        ranges.daily.start,
        ranges.daily.end,
        ['date'],
      );
      details.daily = { rows: dailyRows.length, calls: 1 };
      await this.upsertChunks(
        this.daily,
        dailyRows.map((r) =>
          this.daily.create({
            property_id: property.id,
            date: r.keys[0],
            clicks: Math.round(r.clicks),
            impressions: Math.round(r.impressions),
            ctr: r.ctr,
            position: r.position,
            run_id: run.id,
          }),
        ),
        ['property_id', 'date'],
      );
      await this.daily
        .createQueryBuilder()
        .delete()
        .where('property_id = :id', { id: property.id })
        .andWhere('date BETWEEN :start AND :end', ranges.daily)
        .andWhere('(run_id IS NULL OR run_id <> :run)', { run: run.id })
        .execute();

      // 2. date × dimension, chunked by month, paginated; a failing dimension does not stop the others
      for (const dimension of Object.keys(
        DIMENSION_API,
      ) as (keyof typeof DIMENSION_API)[]) {
        details.dimensions[dimension] = await this.syncDimension(
          run.id,
          property,
          dimension,
          ranges.dimensions,
        );
      }
      // 3. search appearance (one call per day)
      details.dimensions.search_appearance = await this.syncAppearance(
        run.id,
        property,
        ranges.appearance,
      );

      const firstDate = await this.daily
        .createQueryBuilder('d')
        .select("DATE_FORMAT(MIN(d.date), '%Y-%m-%d')", 'min')
        .where('d.property_id = :id', { id: property.id })
        .getRawOne<{ min: string | null }>();

      const incomplete = Object.values(details.dimensions).filter(
        (d) => d && (d.truncated || d.error),
      );
      run.status = incomplete.length ? 'partial' : 'ok';
      run.finished_at = new Date();
      run.error = incomplete.length
        ? incomplete
            .map((d) =>
              d!.error
                ? `fetch failed: ${d!.error}`
                : `page cap hit for ${d!.truncated_windows.map((w) => `${w.start}..${w.end}`).join(', ')}`,
            )
            .join(' | ')
            .slice(0, 2000)
        : null;

      property.last_sync_at = new Date();
      property.last_sync_status = run.status;
      property.last_error = incomplete.length
        ? `${kind} partial: ${describeIncomplete(details)}`.slice(0, 2000)
        : null;
      property.data_since = firstDate?.min ?? null;
      property.coverage = JSON.stringify(
        buildCoverage(
          parseCoverage(property.coverage),
          run,
          kind,
          ranges,
          details,
        ),
      );
      if (property.status === 'error') {
        property.status = 'connected';
      }
      await this.properties.save(property);

      const dimRows = Object.values(details.dimensions).reduce(
        (n, d) => n + (d?.rows ?? 0),
        0,
      );
      const calls =
        details.daily.calls +
        Object.values(details.dimensions).reduce(
          (n, d) => n + (d?.calls ?? 0),
          0,
        );
      run.rows_upserted = dailyRows.length + dimRows;
      run.details = JSON.stringify(details);
      this.logger.log(
        `${kind} ${property.site_url}: ${run.status}, ${dailyRows.length} daily + ${dimRows} dimension rows in ${calls} calls`,
      );
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      run.status = 'failed';
      run.error = message.slice(0, 2000);
      run.finished_at = new Date();
      run.details = JSON.stringify(details);
      this.logger.error(`${kind} ${property.site_url} failed: ${message}`);
      try {
        property.last_error = `${kind} failed: ${message}`.slice(0, 2000);
        property.last_sync_status = 'failed';
        await this.properties.save(property);
      } catch (saveErr) {
        this.logger.error(
          `could not record the error on the property: ${(saveErr as Error).message}`,
        );
      }
    } finally {
      this.inFlight.delete(property.id);
    }
    try {
      return await this.runs.save(run);
    } catch (saveErr) {
      this.logger.error(
        `could not save sync run: ${(saveErr as Error).message}`,
      );
      return run;
    }
  }

  private async syncDimension(
    runId: number,
    property: Property,
    dimension: keyof typeof DIMENSION_API,
    period: Period,
  ): Promise<DimensionRunDetail> {
    const detail: DimensionRunDetail = {
      rows: 0,
      calls: 0,
      truncated: false,
      days: 0,
      complete_windows: [],
      truncated_windows: [],
    };
    try {
      for (const chunk of chunkPeriod(period, CHUNK_DAYS)) {
        const result = await this.gsc.queryAll(
          property.site_url,
          chunk.start,
          chunk.end,
          ['date', DIMENSION_API[dimension]],
        );
        await this.storeRows(runId, property.id, dimension, result);
        detail.rows += result.rows.length;
        detail.calls += result.calls;
        detail.days += daysIn(chunk);
        if (result.truncated) {
          // rows beyond the cap are unknown: keep what is stored, never delete here
          detail.truncated = true;
          detail.truncated_windows.push(chunk);
          this.logger.warn(
            `${property.site_url} ${dimension} ${chunk.start}..${chunk.end}: hit the page cap, rows beyond it are not stored`,
          );
        } else {
          await this.reconcile(runId, property.id, dimension, chunk);
          detail.complete_windows.push(chunk);
        }
      }
    } catch (err) {
      detail.error = ((err as Error).message ?? String(err)).slice(0, 500);
      this.logger.warn(
        `${property.site_url} ${dimension}: fetch failed, stored rows kept: ${detail.error}`,
      );
    }
    return detail;
  }

  private async syncAppearance(
    runId: number,
    property: Property,
    period: Period,
  ): Promise<DimensionRunDetail> {
    const detail: DimensionRunDetail = {
      rows: 0,
      calls: 0,
      truncated: false,
      days: daysIn(period),
      complete_windows: [],
      truncated_windows: [],
    };
    try {
      const result = await this.gsc.querySearchAppearanceByDay(
        property.site_url,
        period.start,
        period.end,
      );
      await this.storeRows(runId, property.id, 'search_appearance', result);
      await this.reconcile(runId, property.id, 'search_appearance', period);
      detail.rows = result.rows.length;
      detail.calls = result.calls;
      detail.complete_windows.push(period);
    } catch (err) {
      detail.error = ((err as Error).message ?? String(err)).slice(0, 500);
      this.logger.warn(
        `${property.site_url} search_appearance: fetch failed, stored rows kept: ${detail.error}`,
      );
    }
    return detail;
  }

  /**
   * A window fetched completely is authoritative: rows for those dates that this run did
   * not write (older runs, keys Google no longer returns) are removed. Retries are
   * idempotent because every row of the window carries the current run id afterwards.
   */
  private async reconcile(
    runId: number,
    propertyId: number,
    dimension: Dimension,
    window: Period,
  ): Promise<void> {
    await this.dims
      .createQueryBuilder()
      .delete()
      .where('property_id = :id', { id: propertyId })
      .andWhere('dimension = :dimension', { dimension })
      .andWhere('date BETWEEN :start AND :end', window)
      .andWhere('(run_id IS NULL OR run_id <> :run)', { run: runId })
      .execute();
  }

  private async storeRows(
    runId: number,
    propertyId: number,
    dimension: Dimension,
    result: GscPagedResult,
  ): Promise<void> {
    const entities = result.rows.map((r) =>
      this.dims.create({
        property_id: propertyId,
        date: r.keys[0],
        dimension,
        key_text: (r.keys[1] ?? '').slice(0, 2048),
        key_hash: createHash('md5')
          .update(r.keys[1] ?? '')
          .digest('hex'),
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr: r.ctr,
        position: r.position,
        run_id: runId,
      }),
    );
    await this.upsertChunks(this.dims, entities, [
      'property_id',
      'date',
      'dimension',
      'key_hash',
    ]);
  }

  private async upsertChunks<T extends { property_id: number }>(
    repo: Repository<T>,
    entities: T[],
    conflictPaths: string[],
  ): Promise<void> {
    for (let i = 0; i < entities.length; i += 500) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await repo.upsert(entities.slice(i, i + 500) as any, conflictPaths);
    }
  }
}

function describeIncomplete(details: RunDetails): string {
  return (Object.keys(details.dimensions) as Dimension[])
    .map((d) => [d, details.dimensions[d]!] as const)
    .filter(([, v]) => v.truncated || v.error)
    .map(([d, v]) =>
      v.error ? `${d} failed (${v.error})` : `${d} hit the page cap`,
    )
    .join('; ');
}

/** Merge this run's outcome into the property's coverage record (see coverage.ts). */
export function buildCoverage(
  previous: PropertyCoverage | null,
  run: SyncRun,
  kind: SyncKind,
  ranges: { daily: Period; dimensions: Period; appearance: Period },
  details: RunDetails,
): PropertyCoverage {
  const dimensions: PropertyCoverage['dimensions'] = {};
  for (const d of Object.keys(details.dimensions) as Dimension[]) {
    const v = details.dimensions[d]!;
    const status: DimensionCoverage['status'] = v.error
      ? 'failed'
      : v.truncated
        ? 'truncated'
        : 'complete';
    const wasIncomplete =
      previous?.dimensions[d]?.since_backfill_incomplete ?? false;
    dimensions[d] = {
      status,
      reason: v.error ? 'error' : v.truncated ? 'page_cap' : undefined,
      error: v.error,
      window: d === 'search_appearance' ? ranges.appearance : ranges.dimensions,
      rows: v.rows,
      since_backfill_incomplete:
        status !== 'complete' || (kind !== 'backfill' && wasIncomplete),
    };
  }
  return {
    run_id: run.id,
    kind,
    finished_at: new Date().toISOString(),
    daily: {
      status: details.daily.error ? 'failed' : 'complete',
      window: ranges.daily,
      rows: details.daily.rows,
    },
    dimensions,
  };
}

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function daysIn(p: Period): number {
  const a = new Date(`${p.start}T00:00:00Z`).getTime();
  const b = new Date(`${p.end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function* chunkPeriod(p: Period, days: number): Generator<Period> {
  let start = p.start;
  while (start <= p.end) {
    const end =
      addDays(start, days - 1) < p.end ? addDays(start, days - 1) : p.end;
    yield { start, end };
    start = addDays(end, 1);
  }
}
