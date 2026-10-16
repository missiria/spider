/* eslint-disable @typescript-eslint/require-await */
import { chunkPeriod } from './sync.service';

describe('chunkPeriod', () => {
  it('splits a 90-day window into 31-day chunks without gaps or overlap', () => {
    const chunks = [
      ...chunkPeriod({ start: '2026-07-15', end: '2026-10-12' }, 31),
    ];
    expect(chunks).toEqual([
      { start: '2026-07-15', end: '2026-08-14' },
      { start: '2026-08-15', end: '2026-09-14' },
      { start: '2026-09-15', end: '2026-10-12' },
    ]);
  });

  it('returns one chunk when the window is shorter than the chunk', () => {
    expect([
      ...chunkPeriod({ start: '2026-10-03', end: '2026-10-12' }, 31),
    ]).toEqual([{ start: '2026-10-03', end: '2026-10-12' }]);
  });
});

import { ConfigService } from '@nestjs/config';
import { SyncService, buildCoverage } from './sync.service';
import { Property } from '../properties/entities/property.entity';
import { SyncRun } from './entities/sync-run.entity';

/** Chainable stand-in for TypeORM's query builder: records deletes, answers MIN(date). */
function fakeQb(log: string[]) {
  const qb: Record<string, unknown> = {};
  for (const m of ['delete', 'where', 'andWhere', 'select', 'from'])
    qb[m] = () => qb;
  qb.execute = async () => {
    log.push('delete');
    return { affected: 0 };
  };
  qb.getRawOne = async () => ({ min: '2026-01-01' });
  return qb;
}

function fakeRepo(log: string[], saveImpl?: (e: unknown) => Promise<unknown>) {
  return {
    create: (e: unknown) => e,
    save: saveImpl ?? (async (e: object) => ({ id: 7, ...e })),
    upsert: async () => undefined,
    update: async () => ({ affected: 0 }),
    findOne: async () => null,
    createQueryBuilder: () => fakeQb(log),
  };
}

function makeService(opts: {
  gsc: Record<string, unknown>;
  runSave?: (e: unknown) => Promise<unknown>;
}) {
  const log: string[] = [];
  const saved: Property[] = [];
  const svc = new SyncService(
    fakeRepo(log) as never,
    fakeRepo(log) as never,
    fakeRepo(log, opts.runSave) as never,
    opts.gsc as never,
    { save: async (p: Property) => (saved.push({ ...p }), p) } as never,
    new ConfigService({
      GSC_DIMENSION_BACKFILL_DAYS: '10',
      GSC_APPEARANCE_BACKFILL_DAYS: '2',
    }),
  );
  return { svc, log, saved };
}

const property = (): Property =>
  ({
    id: 1,
    site_url: 'https://www.example.com/',
    status: 'connected',
    coverage: null,
  }) as unknown as Property;

const row = (date: string, key: string) => ({
  keys: [date, key],
  clicks: 1,
  impressions: 2,
  ctr: 0.5,
  position: 3,
});

describe('SyncService run outcome', () => {
  it('releases the in-flight lock when the initial run insert fails', async () => {
    let fail = true;
    const { svc } = makeService({
      gsc: {
        query: async () => [],
        queryAll: async () => ({ rows: [], calls: 1, truncated: false }),
        querySearchAppearanceByDay: async () => ({
          rows: [],
          calls: 1,
          truncated: false,
        }),
      },
      runSave: async (e) => {
        if (fail) throw new Error('insert rejected');
        return { id: 9, ...(e as object) };
      },
    });
    const p = property();
    await expect(svc.incremental(p)).rejects.toThrow('insert rejected');
    expect(svc.isRunning(1)).toBe(false);
    fail = false;
    const run = await svc.incremental(p);
    expect(run.status).toBe('ok');
    expect(svc.isRunning(1)).toBe(false);
  });

  it('marks a run with a page-capped dimension partial, not ok, and keeps rows of that window', async () => {
    const { svc, log, saved } = makeService({
      gsc: {
        query: async () => [{ ...row('2026-10-01', ''), keys: ['2026-10-01'] }],
        queryAll: async (_s: string, _a: string, _b: string, dims: string[]) =>
          dims[1] === 'query'
            ? { rows: [row('2026-10-01', 'q')], calls: 40, truncated: true }
            : { rows: [row('2026-10-01', 'x')], calls: 1, truncated: false },
        querySearchAppearanceByDay: async () => ({
          rows: [],
          calls: 1,
          truncated: false,
        }),
      },
    });
    const run = await svc.incremental(property());
    expect(run.status).toBe('partial');
    expect(run.error).toMatch(/page cap/);
    const last = saved[saved.length - 1];
    expect(last.last_sync_status).toBe('partial');
    expect(last.last_error).toMatch(/query hit the page cap/);
    const cov = JSON.parse(last.coverage!);
    expect(cov.dimensions.query).toMatchObject({
      status: 'truncated',
      reason: 'page_cap',
      since_backfill_incomplete: true,
    });
    expect(cov.dimensions.page.status).toBe('complete');
    // daily + page + country + device + appearance windows reconciled; query (truncated) not
    expect(log.filter((l) => l === 'delete')).toHaveLength(5);
  });

  it('a failing dimension makes the run partial, keeps stored rows, other dimensions still sync', async () => {
    const { svc, log } = makeService({
      gsc: {
        query: async () => [],
        queryAll: async (
          _s: string,
          _a: string,
          _b: string,
          dims: string[],
        ) => {
          if (dims[1] === 'page') throw new Error('quota exceeded');
          return { rows: [], calls: 1, truncated: false };
        },
        querySearchAppearanceByDay: async () => ({
          rows: [],
          calls: 1,
          truncated: false,
        }),
      },
    });
    const run = await svc.incremental(property());
    expect(run.status).toBe('partial');
    expect(run.error).toMatch(/quota exceeded/);
    expect(log.filter((l) => l === 'delete')).toHaveLength(5); // daily, query, country, device, appearance
  });

  it('daily totals failing fails the run and releases the lock', async () => {
    const { svc } = makeService({
      gsc: {
        query: async () => {
          throw new Error('403 forbidden');
        },
      },
    });
    const run = await svc.incremental(property());
    expect(run.status).toBe('failed');
    expect(svc.isRunning(1)).toBe(false);
  });
});

describe('buildCoverage', () => {
  const ranges = {
    daily: { start: '2026-01-01', end: '2026-10-10' },
    dimensions: { start: '2026-10-01', end: '2026-10-10' },
    appearance: { start: '2026-10-09', end: '2026-10-10' },
  };
  const detail = (truncated: boolean) => ({
    rows: 1,
    calls: 1,
    truncated,
    days: 10,
    complete_windows: [],
    truncated_windows: [],
  });

  it('keeps the incomplete flag across incrementals until a complete backfill clears it', () => {
    const run = { id: 1 } as SyncRun;
    const bad = buildCoverage(null, run, 'incremental', ranges, {
      daily: { rows: 1, calls: 1 },
      dimensions: { query: detail(true) },
    });
    expect(bad.dimensions.query!.since_backfill_incomplete).toBe(true);
    const inc = buildCoverage(bad, run, 'incremental', ranges, {
      daily: { rows: 1, calls: 1 },
      dimensions: { query: detail(false) },
    });
    expect(inc.dimensions.query!.status).toBe('complete');
    expect(inc.dimensions.query!.since_backfill_incomplete).toBe(true);
    const full = buildCoverage(inc, run, 'backfill', ranges, {
      daily: { rows: 1, calls: 1 },
      dimensions: { query: detail(false) },
    });
    expect(full.dimensions.query!.since_backfill_incomplete).toBe(false);
  });
});
