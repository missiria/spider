import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IsNull, LessThan, Repository } from 'typeorm';
import { GscInspectionResult, GscService } from '../gsc/gsc.service';
import { DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { Property } from '../properties/entities/property.entity';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { GscQuotaUsage } from './entities/gsc-quota-usage.entity';
import { GscSitemap } from './entities/gsc-sitemap.entity';
import { TrackedUrl } from './entities/tracked-url.entity';
import { UrlInspection } from './entities/url-inspection.entity';
import { md5 } from './reasons';

/** Google's per-property URL Inspection limit; we never plan above this. */
export const INSPECTION_HARD_CAP = 1900;
const MAX_SITEMAP_URLS = 50_000;
const MAX_CHILD_SITEMAPS = 50;
const MAX_SITEMAP_BYTES = 30 * 1024 * 1024;
/** Re-inspect a URL only after this many days. */
const REINSPECT_DAYS = 7;

export type IndexingStopReason = 'quota' | 'permission_denied' | null;

export interface IndexingRunDetails {
  sitemaps: number;
  sitemap_urls: number;
  sitemap_truncated: boolean;
  sitemap_errors: string[];
  gsc_pages: number;
  tracked_urls: number;
  budget: number;
  inspected: number;
  inspect_errors: number;
  stop_reason: IndexingStopReason;
}

class ApiStop extends Error {
  constructor(
    readonly reason: Exclude<IndexingStopReason, null>,
    message: string,
  ) {
    super(message);
  }
}

function httpStatus(err: unknown): number | undefined {
  return (
    (err as { code?: number }).code ??
    (err as { response?: { status?: number } }).response?.status
  );
}

/**
 * Daily (and on-demand) collection for MITP-0833: Sitemaps API snapshot, inventory of URLs to
 * inspect, then up to `budget` URL Inspection calls. Everything stored here is URL-level data;
 * it never stands in for Search Console's report-wide Page indexing totals (ADR-0009).
 */
@Injectable()
export class IndexingCollectorService implements OnModuleInit {
  private readonly logger = new Logger(IndexingCollectorService.name);
  private readonly inFlight = new Set<number>();
  private readonly dailyBudget: number;
  /** URL Inspection calls in flight at once for one property (Google allows 600 / minute). */
  private readonly concurrency: number;
  /** "Refresh all" / daily batch in progress, in memory like the per-property lock. */
  private batch: { total: number; done: number; started_at: Date } | null =
    null;

  constructor(
    private readonly gsc: GscService,
    private readonly config: ConfigService,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    @InjectRepository(GscSitemap)
    private readonly sitemaps: Repository<GscSitemap>,
    @InjectRepository(TrackedUrl)
    private readonly tracked: Repository<TrackedUrl>,
    @InjectRepository(UrlInspection)
    private readonly inspections: Repository<UrlInspection>,
    @InjectRepository(GscQuotaUsage)
    private readonly quota: Repository<GscQuotaUsage>,
    @InjectRepository(DimensionMetric)
    private readonly dims: Repository<DimensionMetric>,
  ) {
    const configured = Number.parseInt(
      config.get<string>('INDEXING_DAILY_INSPECTIONS') ?? '200',
      10,
    );
    this.dailyBudget = Math.max(
      0,
      Math.min(
        INSPECTION_HARD_CAP,
        Number.isFinite(configured) ? configured : 200,
      ),
    );
    const parallel = Number.parseInt(
      config.get<string>('INDEXING_INSPECT_CONCURRENCY') ?? '4',
      10,
    );
    this.concurrency = Math.max(
      1,
      Math.min(8, Number.isFinite(parallel) ? parallel : 4),
    );
  }

  async onModuleInit(): Promise<void> {
    // a restart mid-run leaves a 'running' row behind: close it like SyncService does
    await this.runs.update(
      { kind: 'indexing', status: 'running' },
      {
        status: 'failed',
        finished_at: new Date(),
        error: 'Interrupted by a restart',
      },
    );
  }

  isRunning(propertyId: number): boolean {
    return this.inFlight.has(propertyId);
  }

  batchStatus(): { total: number; done: number; started_at: Date } | null {
    return this.batch ? { ...this.batch } : null;
  }

  /**
   * Collection for several properties, one after the other (the daily job and "Refresh all").
   * A property already being refreshed is skipped. `after` runs once a property is done.
   */
  async refreshMany(
    properties: Property[],
    after?: (property: Property, run: SyncRun) => Promise<unknown>,
  ): Promise<{ ok: number; partial: number; failed: number; skipped: number }> {
    if (this.batch)
      throw new Error(
        'An indexing refresh of all properties is already running',
      );
    this.batch = { total: properties.length, done: 0, started_at: new Date() };
    const out = { ok: 0, partial: 0, failed: 0, skipped: 0 };
    try {
      for (const property of properties) {
        try {
          if (this.inFlight.has(property.id)) {
            out.skipped += 1;
          } else {
            const run = await this.refresh(property);
            if (run.status === 'ok') out.ok += 1;
            else if (run.status === 'partial') out.partial += 1;
            else out.failed += 1;
            this.logger.log(`indexing ${property.site_url}: ${run.status}`);
            if (after) await after(property, run).catch(() => undefined);
          }
        } catch (err) {
          out.failed += 1;
          this.logger.warn(
            `indexing ${property.site_url}: ${(err as Error).message}`,
          );
        }
        this.batch.done += 1;
      }
    } finally {
      this.batch = null;
    }
    return out;
  }

  getDailyBudget(): number {
    return this.dailyBudget;
  }

  async usedToday(propertyId: number, api = 'url_inspection'): Promise<number> {
    const row = await this.quota.findOne({
      where: { property_id: propertyId, api, date: today() },
    });
    return row?.calls ?? 0;
  }

  /** Full collection run for one property. */
  async refresh(property: Property, budgetOverride?: number): Promise<SyncRun> {
    if (this.inFlight.has(property.id)) {
      throw new Error(
        'An indexing refresh is already running for this property',
      );
    }
    this.inFlight.add(property.id);
    let run: SyncRun;
    try {
      run = await this.runs.save(
        this.runs.create({
          property_id: property.id,
          kind: 'indexing',
          status: 'running',
        }),
      );
    } catch (err) {
      this.inFlight.delete(property.id);
      throw err;
    }
    const details: IndexingRunDetails = {
      sitemaps: 0,
      sitemap_urls: 0,
      sitemap_truncated: false,
      sitemap_errors: [],
      gsc_pages: 0,
      tracked_urls: 0,
      budget: 0,
      inspected: 0,
      inspect_errors: 0,
      stop_reason: null,
    };
    try {
      await this.collectSitemaps(property, details);
      details.gsc_pages = await this.collectGscPages(property);
      details.tracked_urls = await this.tracked.count({
        where: { property_id: property.id },
      });

      const remaining = Math.max(
        0,
        INSPECTION_HARD_CAP - (await this.usedToday(property.id)),
      );
      details.budget = Math.min(budgetOverride ?? this.dailyBudget, remaining);
      if (details.budget === 0 && (budgetOverride ?? this.dailyBudget) > 0) {
        details.stop_reason = 'quota';
      }
      const queue = await this.pickQueue(property.id, details.budget);
      // a small pool of workers: one inspection takes several seconds at Google's end.
      // The first quota / permission stop ends the pool; results already stored are kept.
      let next = 0;
      let stop: unknown = null;
      const worker = async (): Promise<void> => {
        while (!stop && next < queue.length) {
          const t = queue[next];
          next += 1;
          try {
            const saved = await this.inspectOne(property, t.url);
            if (saved.error) details.inspect_errors += 1;
            else details.inspected += 1;
          } catch (err) {
            stop = stop ?? err;
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(this.concurrency, queue.length) }, () =>
          worker(),
        ),
      );
      if (stop) throw stop;
      run.status =
        details.stop_reason || details.sitemap_errors.length ? 'partial' : 'ok';
    } catch (err) {
      if (err instanceof ApiStop) {
        details.stop_reason = err.reason;
        run.status = 'partial';
        run.error = err.message;
      } else {
        run.status = 'failed';
        run.error = (err as Error).message;
        this.logger.warn(
          `indexing ${property.site_url}: ${(err as Error).message}`,
        );
      }
    } finally {
      run.finished_at = new Date();
      run.rows_upserted = details.inspected;
      run.details = JSON.stringify(details);
      await this.runs.save(run).catch(() => undefined);
      this.inFlight.delete(property.id);
    }
    return run;
  }

  /** One URL Inspection call, stored as history. Throws ApiStop on quota / permission. */
  async inspectOne(property: Property, url: string): Promise<UrlInspection> {
    const url_hash = md5(url);
    let result: GscInspectionResult | null = null;
    let error: string | null = null;
    try {
      await this.countCall(property.id, 'url_inspection');
      result = await this.gsc.inspectUrl(property.site_url, url);
    } catch (err) {
      const status = httpStatus(err);
      if (status === 429) {
        throw new ApiStop(
          'quota',
          `URL Inspection quota reached (429) for ${property.site_url}`,
        );
      }
      if (status === 403) {
        throw new ApiStop(
          'permission_denied',
          `URL Inspection permission denied (403) for ${property.site_url}`,
        );
      }
      error = `${status ?? 'error'}: ${(err as Error).message}`.slice(0, 1000);
    }
    const i = result?.indexStatusResult ?? {};
    const row = this.inspections.create({
      property_id: property.id,
      url,
      url_hash,
      inspected_at: new Date(),
      verdict: i.verdict ?? null,
      coverage_state: i.coverageState ?? null,
      indexing_state: i.indexingState ?? null,
      robots_txt_state: i.robotsTxtState ?? null,
      page_fetch_state: i.pageFetchState ?? null,
      crawled_as: i.crawledAs ?? null,
      last_crawl_time: i.lastCrawlTime ? new Date(i.lastCrawlTime) : null,
      google_canonical: i.googleCanonical ?? null,
      user_canonical: i.userCanonical ?? null,
      sitemaps: i.sitemap ? JSON.stringify(i.sitemap) : null,
      referring_urls: i.referringUrls ? JSON.stringify(i.referringUrls) : null,
      raw: result ? JSON.stringify(result) : null,
      error,
    });
    const saved = await this.inspections.save(row);
    await this.ensureTracked(property.id, url, { user_added: false });
    await this.tracked.update(
      { property_id: property.id, url_hash },
      { last_inspected_at: saved.inspected_at },
    );
    return saved;
  }

  async ensureTracked(
    propertyId: number,
    url: string,
    flags: Partial<Pick<TrackedUrl, 'user_added'>>,
  ): Promise<void> {
    const url_hash = md5(url);
    const existing = await this.tracked.findOne({
      where: { property_id: propertyId, url_hash },
    });
    if (existing) {
      if (flags.user_added && !existing.user_added) {
        await this.tracked.update({ id: existing.id }, { user_added: true });
      }
      return;
    }
    await this.tracked.save(
      this.tracked.create({
        property_id: propertyId,
        url,
        url_hash,
        user_added: !!flags.user_added,
      }),
    );
  }

  // ---- inventory ---------------------------------------------------------

  private async collectSitemaps(
    property: Property,
    details: IndexingRunDetails,
  ): Promise<void> {
    let list;
    try {
      await this.countCall(property.id, 'sitemaps');
      list = await this.gsc.listSitemaps(property.site_url);
    } catch (err) {
      if (httpStatus(err) === 403) {
        throw new ApiStop(
          'permission_denied',
          `Sitemaps API permission denied (403) for ${property.site_url}`,
        );
      }
      throw err;
    }
    details.sitemaps = list.length;
    // whole seconds: the timestamp columns have no fractional part, and the stale-flag
    // reset below compares `last_seen_in_source < now`
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const seen = new Set<string>();
    let complete = true;
    for (const sm of list) {
      if (!sm.path) continue;
      const snapshot = this.sitemaps.create({
        property_id: property.id,
        path: sm.path,
        fetched_at: now,
        last_submitted: sm.lastSubmitted ? new Date(sm.lastSubmitted) : null,
        last_downloaded: sm.lastDownloaded ? new Date(sm.lastDownloaded) : null,
        is_pending: !!sm.isPending,
        is_sitemaps_index: !!sm.isSitemapsIndex,
        warnings: Number(sm.warnings ?? 0),
        errors: Number(sm.errors ?? 0),
        contents: sm.contents ? JSON.stringify(sm.contents) : null,
      });
      const read = await this.readSitemapUrls(sm.path, property.site_url);
      snapshot.urls_read = read.urls.length;
      snapshot.urls_truncated = read.truncated;
      snapshot.fetch_error = read.error;
      await this.sitemaps.save(snapshot);
      if (read.error) {
        complete = false;
        details.sitemap_errors.push(`${sm.path}: ${read.error}`);
      }
      if (read.truncated) {
        complete = false;
        details.sitemap_truncated = true;
      }
      for (const url of read.urls) {
        if (seen.size >= MAX_SITEMAP_URLS) break;
        if (seen.has(url)) continue;
        seen.add(url);
        await this.upsertTracked(property.id, url, {
          in_sitemap: true,
          sitemap: sm.path,
          last_seen_in_source: now,
        });
      }
    }
    details.sitemap_urls = seen.size;
    // only a complete read of every sitemap may clear the flag on URLs that left the sitemaps
    if (complete) {
      await this.tracked
        .createQueryBuilder()
        .update()
        .set({ in_sitemap: false })
        .where(
          'property_id = :p AND in_sitemap = 1 AND (last_seen_in_source IS NULL OR last_seen_in_source < :now)',
          {
            p: property.id,
            now,
          },
        )
        .execute();
    }
  }

  /**
   * Pages Search Analytics has ever reported for the property (all stored history, not only the
   * last 28 days): a page that used to get impressions and is now gone is exactly what Google
   * reports as "Not found (404)" or "Page with redirect", so it must stay tracked.
   */
  private async collectGscPages(property: Property): Promise<number> {
    const start = new Date(Date.now() - 28 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const rows: { key_text: string; recent: string }[] = await this.dims
      .createQueryBuilder('d')
      .select('d.key_text', 'key_text')
      .addSelect(
        'SUM(CASE WHEN d.date >= :start THEN d.impressions ELSE 0 END)',
        'recent',
      )
      .where('d.property_id = :p AND d.dimension = :dim', {
        p: property.id,
        dim: 'page',
        start,
      })
      .groupBy('d.key_hash')
      .addGroupBy('d.key_text')
      .having('SUM(d.impressions) > 0')
      .orderBy('recent', 'DESC')
      .limit(5000)
      .getRawMany();
    for (const r of rows) {
      await this.upsertTracked(property.id, r.key_text, {
        in_gsc_pages: true,
        impressions_28d: Number(r.recent),
      });
    }
    return rows.length;
  }

  private async upsertTracked(
    propertyId: number,
    url: string,
    set: Partial<TrackedUrl>,
  ): Promise<void> {
    const url_hash = md5(url);
    const existing = await this.tracked.findOne({
      where: { property_id: propertyId, url_hash },
    });
    if (existing) {
      await this.tracked.update({ id: existing.id }, set);
    } else {
      await this.tracked.save(
        this.tracked.create({ property_id: propertyId, url, url_hash, ...set }),
      );
    }
  }

  /** never-inspected sitemap URLs → never-inspected GSC pages by impressions → oldest inspections */
  private async pickQueue(
    propertyId: number,
    budget: number,
  ): Promise<TrackedUrl[]> {
    if (budget <= 0) return [];
    const picked: TrackedUrl[] = [];
    const take = async (q: Promise<TrackedUrl[]>) => {
      for (const t of await q) {
        if (picked.length >= budget) return;
        if (!picked.some((p) => p.id === t.id)) picked.push(t);
      }
    };
    await take(
      this.tracked.find({
        where: {
          property_id: propertyId,
          in_sitemap: true,
          last_inspected_at: IsNull(),
        },
        order: { impressions_28d: 'DESC', id: 'ASC' },
        take: budget,
      }),
    );
    await take(
      this.tracked.find({
        where: { property_id: propertyId, last_inspected_at: IsNull() },
        order: { impressions_28d: 'DESC', id: 'ASC' },
        take: budget,
      }),
    );
    await take(
      this.tracked.find({
        where: {
          property_id: propertyId,
          last_inspected_at: LessThan(
            new Date(Date.now() - REINSPECT_DAYS * 86_400_000),
          ),
        },
        order: { last_inspected_at: 'ASC' },
        take: budget,
      }),
    );
    return picked;
  }

  private async countCall(propertyId: number, api: string): Promise<void> {
    await this.quota.query(
      'INSERT INTO gsc_quota_usage (property_id, api, date, calls) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE calls = calls + 1',
      [propertyId, api, today()],
    );
  }

  // ---- live sitemap read (labelled "live site" in the UI) ------------------

  private async readSitemapUrls(
    sitemapUrl: string,
    siteUrl: string,
  ): Promise<{ urls: string[]; truncated: boolean; error: string | null }> {
    const urls: string[] = [];
    let truncated = false;
    const errors: string[] = [];
    const queue = [sitemapUrl];
    const visited = new Set<string>();
    while (queue.length && visited.size <= MAX_CHILD_SITEMAPS) {
      const next = queue.shift() as string;
      if (visited.has(next)) continue;
      visited.add(next);
      let xml: string;
      try {
        xml = await this.fetchText(next);
      } catch (err) {
        errors.push((err as Error).message);
        continue;
      }
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
        decodeXml(m[1]),
      );
      if (/<sitemapindex[\s>]/i.test(xml)) {
        queue.push(...locs);
        continue;
      }
      for (const u of locs) {
        if (!belongsTo(u, siteUrl)) continue;
        if (urls.length >= MAX_SITEMAP_URLS) {
          truncated = true;
          break;
        }
        urls.push(u);
      }
    }
    if (queue.length) truncated = true;
    return {
      urls,
      truncated,
      error: errors.length ? errors.join('; ').slice(0, 1000) : null,
    };
  }

  private async fetchText(url: string): Promise<string> {
    if (this.gsc.isMock()) {
      const dir =
        this.config.get<string>('GSC_FIXTURES_DIR') ??
        resolve(process.cwd(), 'fixtures/gsc');
      const file = resolve(
        dir,
        'sitemap-xml',
        `${GscService.fixtureHost(url)}.xml`,
      );
      if (!existsSync(file)) throw new Error(`fixture missing for ${url}`);
      return readFileSync(file, 'utf8');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'SpiderSitemapReader/1.0 (+https://spider.missiria.dev)',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_SITEMAP_BYTES)
        throw new Error('sitemap larger than 30 MB');
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        const { gunzipSync } = await import('node:zlib');
        return gunzipSync(buf).toString('utf8');
      }
      return buf.toString('utf8');
    } finally {
      clearTimeout(timer);
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** URL-prefix properties keep their own prefix; sc-domain: accepts any host of the domain. */
export function belongsTo(url: string, siteUrl: string): boolean {
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.slice('sc-domain:'.length).toLowerCase();
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  }
  return url.startsWith(siteUrl);
}
