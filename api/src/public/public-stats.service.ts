import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Aggregate, anonymous numbers for missiria.dev's "live from Spider" strip (MISS-0129). */
export interface PublicStats {
  properties: number;
  keywords: number;
  clicks28d: number;
  impressions28d: number;
  avgPosition28d: number | null;
  dataThrough: string | null;
  generatedAt: string;
}

const CACHE_MS = 60 * 60 * 1000;

/**
 * Totals across every workspace. By design the response carries no property, URL, workspace or
 * user field: it is served without authentication. Raw SQL on purpose, so no tenant scoping or
 * entity hydration is involved, and one cached result per hour keeps the cost at four queries.
 */
@Injectable()
export class PublicStatsService {
  private cache: { at: number; value: PublicStats } | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async stats(now = Date.now()): Promise<PublicStats> {
    if (this.cache && now - this.cache.at < CACHE_MS) {
      return this.cache.value;
    }
    const value = await this.compute(now);
    this.cache = { at: now, value };
    return value;
  }

  private async compute(now: number): Promise<PublicStats> {
    const generatedAt = new Date(now).toISOString();
    const [{ through }] = (await this.dataSource.query(
      'SELECT MAX(`date`) AS through FROM daily_metrics',
    )) as Array<{ through: string | null }>;
    const [{ properties }] = (await this.dataSource.query(
      'SELECT COUNT(*) AS properties FROM properties',
    )) as Array<{ properties: string | number }>;
    if (!through) {
      return {
        properties: Number(properties),
        keywords: 0,
        clicks28d: 0,
        impressions28d: 0,
        avgPosition28d: null,
        dataThrough: null,
        generatedAt,
      };
    }
    const [agg] = (await this.dataSource.query(
      `SELECT SUM(clicks) AS clicks, SUM(impressions) AS impressions,
              SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS position
         FROM daily_metrics
        WHERE \`date\` > DATE_SUB(?, INTERVAL 28 DAY) AND \`date\` <= ?`,
      [through, through],
    )) as Array<{
      clicks: string | null;
      impressions: string | null;
      position: string | null;
    }>;
    const [{ keywords }] = (await this.dataSource.query(
      `SELECT COUNT(DISTINCT key_hash) AS keywords
         FROM dimension_metrics
        WHERE dimension = 'query' AND \`date\` > DATE_SUB(?, INTERVAL 28 DAY) AND \`date\` <= ?`,
      [through, through],
    )) as Array<{ keywords: string | number }>;
    const position =
      agg.position === null ? null : Math.round(Number(agg.position) * 10) / 10;
    return {
      properties: Number(properties),
      keywords: Number(keywords),
      clicks28d: Number(agg.clicks ?? 0),
      impressions28d: Number(agg.impressions ?? 0),
      avgPosition28d: position,
      dataThrough: through,
      generatedAt,
    };
  }
}
