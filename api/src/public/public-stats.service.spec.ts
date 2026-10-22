import { DataSource } from 'typeorm';
import { PublicStatsService } from './public-stats.service';

function dataSource(rows: Record<string, unknown[]>): DataSource {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('MAX(`date`)')) return rows.through;
      if (sql.includes('FROM properties')) return rows.properties;
      if (sql.includes('FROM daily_metrics')) return rows.agg;
      if (sql.includes('FROM dimension_metrics')) return rows.keywords;
      throw new Error('unexpected query: ' + sql);
    }),
  } as unknown as DataSource;
}

describe('PublicStatsService', () => {
  const rows = {
    through: [{ through: '2026-10-19' }],
    properties: [{ properties: '16' }],
    agg: [{ clicks: '8292', impressions: '116262', position: '12.34' }],
    keywords: [{ keywords: '4120' }],
  };

  it('returns aggregate numbers only, with the data-through date', async () => {
    const ds = dataSource(rows);
    const stats = await new PublicStatsService(ds).stats(1_000);
    expect(stats).toEqual({
      properties: 16,
      keywords: 4120,
      clicks28d: 8292,
      impressions28d: 116262,
      avgPosition28d: 12.3,
      dataThrough: '2026-10-19',
      generatedAt: new Date(1_000).toISOString(),
    });
    for (const key of Object.keys(stats)) {
      expect([
        'properties',
        'keywords',
        'clicks28d',
        'impressions28d',
        'avgPosition28d',
        'dataThrough',
        'generatedAt',
      ]).toContain(key);
    }
  });

  it('caches for one hour', async () => {
    const ds = dataSource(rows);
    const service = new PublicStatsService(ds);
    await service.stats(0);
    await service.stats(30 * 60 * 1000);
    expect((ds.query as jest.Mock).mock.calls.length).toBe(4);
    await service.stats(61 * 60 * 1000);
    expect((ds.query as jest.Mock).mock.calls.length).toBe(8);
  });

  it('handles an empty database', async () => {
    const ds = dataSource({
      through: [{ through: null }],
      properties: [{ properties: 0 }],
      agg: [],
      keywords: [],
    });
    const stats = await new PublicStatsService(ds).stats(5);
    expect(stats.dataThrough).toBeNull();
    expect(stats.avgPosition28d).toBeNull();
    expect(stats.clicks28d).toBe(0);
  });
});
