import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { GscSitemap } from './entities/gsc-sitemap.entity';
import { IndexingExample } from './entities/indexing-example.entity';
import {
  IndexingImport,
  IndexingScope,
} from './entities/indexing-import.entity';
import { IndexingReason } from './entities/indexing-reason.entity';
import { IndexingTrend } from './entities/indexing-trend.entity';
import { TrackedUrl } from './entities/tracked-url.entity';
import { UrlInspection } from './entities/url-inspection.entity';
import { ExportParseError, parseIndexingExport } from './export-parser';
import {
  belongsTo,
  IndexingCollectorService,
} from './indexing-collector.service';
import {
  gscInspectLink,
  gscReportLink,
  isIndexedCoverage,
  md5,
  reasonHash,
  reasonIntent,
  reasonSource,
  scopeHash,
} from './reasons';

/** An import older than this is flagged stale in the UI and in reports. */
export const INDEXING_STALE_DAYS = 14;

export interface ScopeRef {
  scope: IndexingScope;
  scope_detail: string | null;
}

function sameSite(a: string, b: string): boolean {
  const n = (s: string) => s.trim().toLowerCase().replace(/\/+$/, '');
  return n(a) === n(b);
}

function daysSince(isoDate: string): number {
  return Math.floor(
    (Date.now() - new Date(`${isoDate}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

@Injectable()
export class IndexingService {
  constructor(
    private readonly properties: PropertiesService,
    private readonly collector: IndexingCollectorService,
    private readonly db: DataSource,
    @InjectRepository(IndexingImport)
    private readonly imports: Repository<IndexingImport>,
    @InjectRepository(IndexingReason)
    private readonly reasons: Repository<IndexingReason>,
    @InjectRepository(IndexingTrend)
    private readonly trend: Repository<IndexingTrend>,
    @InjectRepository(IndexingExample)
    private readonly examples: Repository<IndexingExample>,
    @InjectRepository(TrackedUrl)
    private readonly tracked: Repository<TrackedUrl>,
    @InjectRepository(UrlInspection)
    private readonly inspections: Repository<UrlInspection>,
    @InjectRepository(GscSitemap)
    private readonly sitemaps: Repository<GscSitemap>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
  ) {}

  // ---- import ------------------------------------------------------------

  async importExport(
    propertyId: number,
    buf: Buffer,
    filename: string,
    userId: number | null,
  ): Promise<{ import: IndexingImport; replaced: boolean }> {
    const property = await this.properties.get(propertyId);
    let parsed;
    try {
      parsed = parseIndexingExport(buf, filename);
    } catch (err) {
      if (err instanceof ExportParseError)
        throw new BadRequestException(err.message);
      throw err;
    }
    if (parsed.property && !sameSite(parsed.property, property.site_url)) {
      throw new BadRequestException(
        `This export is for ${parsed.property}, not ${property.site_url}. Upload it on the matching property.`,
      );
    }
    const sHash = scopeHash(parsed.scope, parsed.scope_detail);
    const issueHash = parsed.issue_reason
      ? reasonHash(parsed.issue_reason)
      : null;

    const saved = await this.db.transaction(async (m) => {
      // same view, same report date: replace (re-uploading is idempotent)
      const prior = await m.find(IndexingImport, {
        where: {
          property_id: property.id,
          report_kind: parsed.kind,
          scope_hash: sHash,
          report_date: parsed.report_date,
          ...(issueHash ? { issue_reason_hash: issueHash } : {}),
        },
      });
      const sameIssue = prior.filter(
        (p) => (p.issue_reason_hash ?? null) === issueHash,
      );
      if (sameIssue.length)
        await m.delete(IndexingImport, { id: In(sameIssue.map((p) => p.id)) });

      const imp = await m.save(
        m.create(IndexingImport, {
          property_id: property.id,
          uploaded_by: userId,
          filename: filename.slice(0, 255),
          report_kind: parsed.kind,
          scope: parsed.scope,
          scope_detail: parsed.scope_detail,
          scope_hash: sHash,
          issue_reason: parsed.issue_reason,
          issue_reason_hash: issueHash,
          report_date: parsed.report_date,
          reason_rows: parsed.reasons.length,
          trend_rows: parsed.trend.length,
          example_rows: parsed.examples.length,
          examples_partial: parsed.examples_partial,
          metadata_raw: JSON.stringify({
            metadata: parsed.metadata,
            files: parsed.files,
          }),
        }),
      );
      if (parsed.reasons.length) {
        await m.insert(
          IndexingReason,
          parsed.reasons.map((r) => ({
            import_id: imp.id,
            property_id: property.id,
            scope: parsed.scope,
            scope_hash: sHash,
            report_date: parsed.report_date,
            reason: r.reason.slice(0, 512),
            reason_hash: reasonHash(r.reason),
            source: r.source,
            reason_group: r.group,
            validation: r.validation,
            pages: r.pages,
          })),
        );
      }
      for (let i = 0; i < parsed.trend.length; i += 500) {
        await m.insert(
          IndexingTrend,
          parsed.trend.slice(i, i + 500).map((t) => ({
            import_id: imp.id,
            property_id: property.id,
            ...t,
          })),
        );
      }
      for (let i = 0; i < parsed.examples.length; i += 500) {
        await m.insert(
          IndexingExample,
          parsed.examples.slice(i, i + 500).map((e) => ({
            import_id: imp.id,
            property_id: property.id,
            reason_hash: issueHash ?? '',
            url: e.url.slice(0, 2048),
            last_crawled: e.last_crawled,
          })),
        );
      }
      return { import: imp, replaced: sameIssue.length > 0 };
    });
    // example URLs of a reason (for instance the 404 list) are in no sitemap: track them, so
    // the next refreshes inspect them and the automatic view shows the reason too
    for (const e of parsed.examples) {
      if (belongsTo(e.url, property.site_url))
        await this.collector
          .ensureTracked(property.id, e.url.slice(0, 2048), {})
          .catch(() => undefined);
    }
    return saved;
  }

  async deleteImport(propertyId: number, importId: number): Promise<void> {
    await this.properties.get(propertyId);
    const res = await this.imports.delete({
      id: importId,
      property_id: propertyId,
    });
    if (!res.affected) throw new NotFoundException('Import not found');
  }

  // ---- reads -------------------------------------------------------------

  async scopes(
    propertyId: number,
  ): Promise<(ScopeRef & { scope_hash: string; last_report_date: string })[]> {
    const rows: {
      scope: IndexingScope;
      scope_detail: string | null;
      scope_hash: string;
      d: string;
    }[] = await this.imports
      .createQueryBuilder('i')
      .select([
        'i.scope AS scope',
        'i.scope_detail AS scope_detail',
        'i.scope_hash AS scope_hash',
      ])
      .addSelect('MAX(i.report_date)', 'd')
      .where('i.property_id = :p AND i.report_kind = :k', {
        p: propertyId,
        k: 'overview',
      })
      .groupBy('i.scope_hash')
      .addGroupBy('i.scope')
      .addGroupBy('i.scope_detail')
      .getRawMany();
    return rows.map((r) => ({
      scope: r.scope,
      scope_detail: r.scope_detail,
      scope_hash: r.scope_hash,
      last_report_date:
        typeof r.d === 'string'
          ? r.d.slice(0, 10)
          : new Date(r.d).toISOString().slice(0, 10),
    }));
  }

  private async overviewImports(
    propertyId: number,
    sHash: string,
  ): Promise<IndexingImport[]> {
    return this.imports.find({
      where: {
        property_id: propertyId,
        report_kind: 'overview',
        scope_hash: sHash,
      },
      order: { report_date: 'DESC', id: 'DESC' },
    });
  }

  /** Property dashboard for one scope (default: All known pages). */
  async propertyIndexing(propertyId: number, scope?: string, detail?: string) {
    const property = await this.properties.get(propertyId);
    const ref: ScopeRef = {
      scope: (['all_known', 'submitted', 'sitemap'].includes(scope ?? '')
        ? scope
        : 'all_known') as IndexingScope,
      scope_detail: scope === 'sitemap' ? (detail ?? null) : null,
    };
    const sHash = scopeHash(ref.scope, ref.scope_detail);
    const list = await this.overviewImports(property.id, sHash);
    const latest = list[0] ?? null;
    const previous = list[1] ?? null;

    let reasons: Awaited<ReturnType<IndexingService['reasonRows']>> = [];
    let trendRows: IndexingTrend[] = [];
    if (latest) {
      reasons = await this.reasonRows(property.id, sHash, latest, previous);
      trendRows = await this.trend.find({
        where: { import_id: latest.id },
        order: { date: 'ASC' },
      });
    }
    const last = trendRows[trendRows.length - 1] ?? null;
    const prevTrend = previous
      ? await this.trend.findOne({
          where: { import_id: previous.id },
          order: { date: 'DESC' },
        })
      : null;

    return {
      property: {
        id: property.id,
        site_url: property.site_url,
        display_name: property.display_name,
      },
      scope: ref,
      scopes: await this.scopes(property.id),
      report: latest
        ? {
            import_id: latest.id,
            report_date: latest.report_date,
            filename: latest.filename,
            imported_at: latest.created_at,
            stale: daysSince(latest.report_date) > INDEXING_STALE_DAYS,
            days_old: daysSince(latest.report_date),
            source: 'gsc_export' as const,
          }
        : null,
      totals: last
        ? {
            date: last.date,
            indexed: last.indexed,
            not_indexed: last.not_indexed,
            previous_indexed: prevTrend?.indexed ?? null,
            previous_not_indexed: prevTrend?.not_indexed ?? null,
            previous_date: prevTrend?.date ?? null,
          }
        : null,
      trend: trendRows.map((t) => ({
        date: t.date,
        indexed: t.indexed,
        not_indexed: t.not_indexed,
        impressions: t.impressions,
      })),
      reasons,
      imports: (
        await this.imports.find({
          where: { property_id: property.id },
          order: { created_at: 'DESC' },
          take: 30,
        })
      ).map((i) => ({
        id: i.id,
        report_kind: i.report_kind,
        scope: i.scope,
        scope_detail: i.scope_detail,
        issue_reason: i.issue_reason,
        report_date: i.report_date,
        filename: i.filename,
        reason_rows: i.reason_rows,
        example_rows: i.example_rows,
        examples_partial: i.examples_partial,
        created_at: i.created_at,
      })),
      inspection: await this.inspectionSummary(property),
      live: await this.liveIndexing(property),
      links: { search_console: gscReportLink(property.site_url) },
    };
  }

  /**
   * The Page indexing report rebuilt from URL Inspection results (no upload): for each day,
   * the latest inspection of every tracked URL up to that day, grouped by Google's coverage
   * state. It covers the URLs Spider tracks, not every page Google knows.
   */
  async liveIndexing(property: Property, days = 90) {
    const rows: {
      url_hash: string;
      d: string;
      coverage_state: string | null;
    }[] = await this.db.query(
      `SELECT url_hash, DATE_FORMAT(inspected_at, '%Y-%m-%d') AS d, coverage_state
           FROM url_inspections
          WHERE property_id = ? AND error IS NULL
          ORDER BY inspected_at ASC, id ASC`,
      [property.id],
    );
    const tracked = await this.tracked.count({
      where: { property_id: property.id },
    });
    if (!rows.length) {
      return {
        source: 'url_inspection_api' as const,
        last_update: null,
        tracked_urls: tracked,
        inspected_urls: 0,
        totals: null,
        trend: [],
        reasons: [],
      };
    }
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const today = iso(Date.now());
    const first = rows[0].d;
    const windowStart = iso(Date.now() - (days - 1) * 86_400_000);
    const start = first > windowStart ? first : windowStart;
    const impressions = new Map<string, number>(
      (
        (await this.db.query(
          `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS d, impressions FROM daily_metrics WHERE property_id = ? AND date >= ?`,
          [property.id, start],
        )) as { d: string; impressions: number }[]
      ).map((r) => [r.d, Number(r.impressions)]),
    );

    const state = new Map<string, string>(); // url_hash -> latest coverage state
    const trend: {
      date: string;
      indexed: number;
      not_indexed: number;
      impressions: number | null;
    }[] = [];
    const perReason = new Map<string, { date: string; pages: number }[]>();
    let i = 0;
    const apply = (until: string) => {
      while (i < rows.length && rows[i].d <= until) {
        state.set(rows[i].url_hash, rows[i].coverage_state ?? '(no state)');
        i += 1;
      }
    };
    // inspections older than the window still define the state on its first day
    for (
      let t = new Date(`${start}T00:00:00Z`).getTime();
      iso(t) <= today;
      t += 86_400_000
    ) {
      const day = iso(t);
      apply(day);
      const counts = new Map<string, number>();
      for (const s of state.values()) counts.set(s, (counts.get(s) ?? 0) + 1);
      let indexed = 0;
      let notIndexed = 0;
      for (const [s, n] of counts) {
        if (isIndexedCoverage(s)) indexed += n;
        else notIndexed += n;
      }
      trend.push({
        date: day,
        indexed,
        not_indexed: notIndexed,
        impressions: impressions.get(day) ?? null,
      });
      for (const s of new Set([...counts.keys(), ...perReason.keys()])) {
        // a state first seen today had 0 pages on the earlier days of the window
        const list =
          perReason.get(s) ??
          trend.slice(0, -1).map((t) => ({ date: t.date, pages: 0 }));
        list.push({ date: day, pages: counts.get(s) ?? 0 });
        perReason.set(s, list);
      }
    }
    const last = trend[trend.length - 1];
    const reasons = [...perReason.entries()]
      .map(([reason, series]) => {
        const indexed = isIndexedCoverage(reason);
        return {
          reason,
          reason_hash: reasonHash(reason),
          source: reasonSource(reason),
          group: (indexed ? 'indexed' : 'not_indexed') as
            'indexed' | 'not_indexed',
          intent: reasonIntent(reason),
          validation: null,
          pages: series[series.length - 1].pages,
          trend: series,
        };
      })
      .sort((a, b) => b.pages - a.pages);
    return {
      source: 'url_inspection_api' as const,
      last_update: rows[rows.length - 1].d,
      tracked_urls: tracked,
      inspected_urls: state.size,
      totals: { indexed: last.indexed, not_indexed: last.not_indexed },
      trend,
      reasons,
    };
  }

  private async reasonRows(
    propertyId: number,
    sHash: string,
    latest: IndexingImport,
    previous: IndexingImport | null,
  ) {
    const current = await this.reasons.find({
      where: { import_id: latest.id },
      order: { pages: 'DESC' },
    });
    const prev = previous
      ? await this.reasons.find({ where: { import_id: previous.id } })
      : [];
    const firstSeen: { reason_hash: string; d: string }[] = await this.reasons
      .createQueryBuilder('r')
      .select('r.reason_hash', 'reason_hash')
      .addSelect('MIN(r.report_date)', 'd')
      .where('r.property_id = :p AND r.scope_hash = :s', {
        p: propertyId,
        s: sHash,
      })
      .groupBy('r.reason_hash')
      .getRawMany();
    const first = new Map(
      firstSeen.map((f) => [f.reason_hash, String(f.d).slice(0, 10)]),
    );
    const issueImports = await this.imports.find({
      where: {
        property_id: propertyId,
        report_kind: 'issue',
        scope_hash: sHash,
      },
      select: ['issue_reason_hash'],
    });
    const withExamples = new Set(issueImports.map((i) => i.issue_reason_hash));
    // pages per imported report, oldest first: the sparkline of each reason
    const past = await this.reasons.find({
      where: { property_id: propertyId, scope_hash: sHash },
      order: { report_date: 'ASC' },
      select: ['reason_hash', 'report_date', 'pages'],
    });
    const history = new Map<string, { date: string; pages: number }[]>();
    for (const h of past) {
      const list = history.get(h.reason_hash) ?? [];
      list.push({ date: h.report_date, pages: h.pages });
      history.set(h.reason_hash, list);
    }
    return current.map((r) => {
      const p = prev.find((x) => x.reason_hash === r.reason_hash);
      return {
        reason: r.reason,
        reason_hash: r.reason_hash,
        source: r.source,
        group: r.reason_group,
        intent: reasonIntent(r.reason),
        validation: r.validation,
        pages: r.pages,
        previous_pages: previous ? (p?.pages ?? 0) : null,
        is_new: previous ? !p : false,
        first_seen: first.get(r.reason_hash) ?? r.report_date,
        has_examples: withExamples.has(r.reason_hash),
        trend: (history.get(r.reason_hash) ?? []).slice(-30),
      };
    });
  }

  /** Issue detail: counts over imports, latest examples, validation history. */
  async reasonDetail(
    propertyId: number,
    hash: string,
    scope?: string,
    detail?: string,
  ) {
    const property = await this.properties.get(propertyId);
    const ref: ScopeRef = {
      scope: (['all_known', 'submitted', 'sitemap'].includes(scope ?? '')
        ? scope
        : 'all_known') as IndexingScope,
      scope_detail: scope === 'sitemap' ? (detail ?? null) : null,
    };
    const sHash = scopeHash(ref.scope, ref.scope_detail);
    const history = await this.reasons.find({
      where: { property_id: property.id, scope_hash: sHash, reason_hash: hash },
      order: { report_date: 'ASC' },
    });
    const issue = await this.imports.findOne({
      where: {
        property_id: property.id,
        report_kind: 'issue',
        issue_reason_hash: hash,
        scope_hash: sHash,
      },
      order: { report_date: 'DESC', id: 'DESC' },
    });
    if (!history.length && !issue)
      throw new NotFoundException('No data for this reason');
    const name =
      history[history.length - 1]?.reason ?? issue?.issue_reason ?? '';
    const examples = issue
      ? await this.examples.find({
          where: { import_id: issue.id },
          order: { last_crawled: 'DESC' },
          take: 1000,
        })
      : [];
    const issueTrend = issue
      ? await this.trend.find({
          where: { import_id: issue.id },
          order: { date: 'ASC' },
        })
      : [];
    return {
      property: {
        id: property.id,
        site_url: property.site_url,
        display_name: property.display_name,
      },
      scope: ref,
      reason: name,
      reason_hash: hash,
      intent: reasonIntent(name),
      source: history[history.length - 1]?.source ?? null,
      group: history[history.length - 1]?.reason_group ?? null,
      history: history.map((h) => ({
        report_date: h.report_date,
        pages: h.pages,
        validation: h.validation,
      })),
      first_seen: history[0]?.report_date ?? issue?.report_date ?? null,
      issue_export: issue
        ? {
            import_id: issue.id,
            report_date: issue.report_date,
            examples_partial: issue.examples_partial,
            example_rows: issue.example_rows,
          }
        : null,
      trend: issueTrend.map((t) => ({ date: t.date, pages: t.not_indexed })),
      examples: examples.map((e) => ({
        url: e.url,
        last_crawled: e.last_crawled,
        inspect_link: gscInspectLink(property.site_url, e.url),
      })),
      links: { search_console: gscReportLink(property.site_url) },
    };
  }

  /** Latest inspection per tracked URL, with counts by Google coverage state. */
  async inspectionSummary(property: Property) {
    // read the flag BEFORE the run row: "not running" then guarantees the row below is final
    const running = this.collector.isRunning(property.id);
    const rows: {
      coverage_state: string | null;
      verdict: string | null;
      n: string;
    }[] = await this.db.query(
      `SELECT i.coverage_state, i.verdict, COUNT(*) AS n
         FROM url_inspections i
         JOIN (SELECT MAX(id) AS id FROM url_inspections WHERE property_id = ? AND error IS NULL GROUP BY url_hash) l ON l.id = i.id
        GROUP BY i.coverage_state, i.verdict
        ORDER BY n DESC`,
      [property.id],
    );
    const lastRun = await this.runs.findOne({
      where: { property_id: property.id, kind: 'indexing' },
      order: { started_at: 'DESC' },
    });
    const details = lastRun?.details
      ? (JSON.parse(lastRun.details) as Record<string, unknown>)
      : null;
    const latestSitemapFetch = await this.sitemaps.findOne({
      where: { property_id: property.id },
      order: { fetched_at: 'DESC' },
    });
    const sitemapRows = latestSitemapFetch
      ? await this.sitemaps.find({
          where: {
            property_id: property.id,
            fetched_at: latestSitemapFetch.fetched_at,
          },
        })
      : [];
    const total = rows.reduce((a, r) => a + Number(r.n), 0);
    return {
      inspected_urls: total,
      indexed_urls: rows
        .filter((r) => isIndexedCoverage(r.coverage_state))
        .reduce((a, r) => a + Number(r.n), 0),
      tracked_urls: await this.tracked.count({
        where: { property_id: property.id },
      }),
      by_coverage: rows.map((r) => ({
        coverage_state: r.coverage_state ?? '(none)',
        verdict: r.verdict,
        urls: Number(r.n),
      })),
      daily_budget: this.collector.getDailyBudget(),
      used_today: await this.collector.usedToday(property.id),
      running,
      last_run: lastRun
        ? {
            status: lastRun.status,
            started_at: lastRun.started_at,
            finished_at: lastRun.finished_at,
            error: lastRun.error,
            stop_reason: (details?.stop_reason as string | null) ?? null,
            details,
          }
        : null,
      sitemaps: sitemapRows.map((s) => ({
        path: s.path,
        last_submitted: s.last_submitted,
        last_downloaded: s.last_downloaded,
        is_pending: s.is_pending,
        warnings: s.warnings,
        errors: s.errors,
        contents: s.contents ? JSON.parse(s.contents) : [],
        urls_read: s.urls_read,
        urls_truncated: s.urls_truncated,
        fetch_error: s.fetch_error,
        fetched_at: s.fetched_at,
      })),
      source: 'url_inspection_api' as const,
    };
  }

  async urls(
    propertyId: number,
    q: {
      coverage?: string;
      verdict?: string;
      in_sitemap?: string;
      search?: string;
      page?: number;
    },
  ) {
    const property = await this.properties.get(propertyId);
    const where: string[] = ['t.property_id = ?'];
    const params: unknown[] = [property.id];
    if (q.coverage) {
      where.push('i.coverage_state = ?');
      params.push(q.coverage);
    }
    if (q.verdict) {
      where.push('i.verdict = ?');
      params.push(q.verdict);
    }
    if (q.in_sitemap === '1') where.push('t.in_sitemap = 1');
    if (q.search) {
      where.push('t.url LIKE ?');
      params.push(`%${q.search.replace(/[%_]/g, '')}%`);
    }
    const page = Math.max(1, q.page ?? 1);
    const sql = `FROM tracked_urls t
      LEFT JOIN (SELECT url_hash, MAX(id) AS id FROM url_inspections WHERE property_id = ? GROUP BY url_hash) l ON l.url_hash = t.url_hash
      LEFT JOIN url_inspections i ON i.id = l.id
      WHERE ${where.join(' AND ')}`;
    const all = [property.id, ...params];
    const [{ n }] = await this.db.query(`SELECT COUNT(*) AS n ${sql}`, all);
    const items = await this.db.query(
      `SELECT t.url, t.url_hash, t.in_sitemap, t.sitemap, t.in_gsc_pages, t.impressions_28d, t.user_added, t.last_inspected_at,
              i.inspected_at, i.verdict, i.coverage_state, i.indexing_state, i.robots_txt_state, i.page_fetch_state,
              i.last_crawl_time, i.google_canonical, i.user_canonical, i.error
       ${sql}
       ORDER BY (i.verdict = 'PASS') ASC, t.impressions_28d DESC, t.id ASC
       LIMIT 100 OFFSET ?`,
      [...all, (page - 1) * 100],
    );
    return {
      total: Number(n),
      page,
      page_size: 100,
      items,
      source: 'url_inspection_api' as const,
    };
  }

  async urlDetail(propertyId: number, hash: string) {
    const property = await this.properties.get(propertyId);
    const tracked = await this.tracked.findOne({
      where: { property_id: property.id, url_hash: hash },
    });
    const history = await this.inspections.find({
      where: { property_id: property.id, url_hash: hash },
      order: { inspected_at: 'DESC' },
      take: 50,
    });
    if (!tracked && !history.length)
      throw new NotFoundException('URL not tracked');
    const url = tracked?.url ?? history[0].url;
    const parse = (s: string | null) => (s ? (JSON.parse(s) as unknown) : null);
    return {
      property: {
        id: property.id,
        site_url: property.site_url,
        display_name: property.display_name,
      },
      url,
      url_hash: hash,
      tracked,
      latest: history[0]
        ? {
            ...history[0],
            sitemaps: parse(history[0].sitemaps),
            referring_urls: parse(history[0].referring_urls),
            raw: parse(history[0].raw),
          }
        : null,
      history: history.map((h) => ({
        inspected_at: h.inspected_at,
        verdict: h.verdict,
        coverage_state: h.coverage_state,
        last_crawl_time: h.last_crawl_time,
        google_canonical: h.google_canonical,
        error: h.error,
      })),
      links: { inspect: gscInspectLink(property.site_url, url) },
      source: 'url_inspection_api' as const,
    };
  }

  async inspectNow(propertyId: number, url: string) {
    const property = await this.properties.get(propertyId);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Not a valid URL');
    }
    const inScope = property.site_url.startsWith('sc-domain:')
      ? parsed.hostname === property.site_url.slice(10) ||
        parsed.hostname.endsWith(`.${property.site_url.slice(10)}`)
      : parsed.href.startsWith(property.site_url);
    if (!inScope)
      throw new BadRequestException(
        `The URL is not part of ${property.site_url}`,
      );
    await this.collector.ensureTracked(property.id, parsed.href, {
      user_added: true,
    });
    try {
      const saved = await this.collector.inspectOne(property, parsed.href);
      return this.urlDetail(property.id, saved.url_hash);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Live HTTP check (Spider's own fetch, NOT Google's indexed version). */
  async liveCheck(propertyId: number, hash: string) {
    const property = await this.properties.get(propertyId);
    const tracked = await this.tracked.findOne({
      where: { property_id: property.id, url_hash: hash },
    });
    if (!tracked) throw new NotFoundException('URL not tracked');
    const started = Date.now();
    const hops: { url: string; status: number; location: string | null }[] = [];
    let current = tracked.url;
    let robots: string | null = null;
    let canonical: string | null = null;
    try {
      for (let i = 0; i < 5; i += 1) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        const res = await fetch(current, {
          redirect: 'manual',
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'SpiderLiveCheck/1.0 (+https://spider.missiria.dev)',
          },
        }).finally(() => clearTimeout(timer));
        const location = res.headers.get('location');
        hops.push({ url: current, status: res.status, location });
        robots = res.headers.get('x-robots-tag') ?? robots;
        if (res.status >= 300 && res.status < 400 && location) {
          current = new URL(location, current).href;
          continue;
        }
        if ((res.headers.get('content-type') ?? '').includes('html')) {
          const html = (await res.text()).slice(0, 500_000);
          const head = html.split(/<\/head>/i)[0];
          canonical =
            /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i.exec(
              head,
            )?.[1] ?? null;
          const meta =
            /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)/i.exec(
              head,
            )?.[1];
          robots = [robots, meta].filter(Boolean).join(' | ') || null;
        }
        break;
      }
      return {
        url: tracked.url,
        checked_at: new Date(),
        final_url: current,
        final_status: hops[hops.length - 1]?.status ?? null,
        hops,
        robots,
        canonical,
        ms: Date.now() - started,
        source: 'live_http' as const,
        note: 'Spider fetched the page now. This is not Google’s indexed version; a CDN or bot protection can answer differently to Google.',
      };
    } catch (err) {
      return {
        url: tracked.url,
        checked_at: new Date(),
        error: (err as Error).message,
        hops,
        source: 'live_http' as const,
      };
    }
  }

  /** Latest inspection of every tracked URL, counted per property and coverage state. */
  private async liveCounts(): Promise<
    Map<number, { coverage_state: string; urls: number }[]>
  > {
    const rows: {
      property_id: number;
      coverage_state: string | null;
      n: string;
    }[] = await this.db.query(
      `SELECT i.property_id, i.coverage_state, COUNT(*) AS n
           FROM url_inspections i
           JOIN (SELECT MAX(id) AS id FROM url_inspections WHERE error IS NULL GROUP BY property_id, url_hash) l ON l.id = i.id
          GROUP BY i.property_id, i.coverage_state`,
    );
    const out = new Map<number, { coverage_state: string; urls: number }[]>();
    for (const r of rows) {
      const list = out.get(r.property_id) ?? [];
      list.push({
        coverage_state: r.coverage_state ?? '(no state)',
        urls: Number(r.n),
      });
      out.set(r.property_id, list);
    }
    return out;
  }

  /** Fleet table: one row per connected property, All known pages scope. */
  async fleet() {
    const props = (await this.properties.list()).filter(
      (p) => p.status !== 'revoked',
    );
    const sHash = scopeHash('all_known', null);
    const liveByProperty = await this.liveCounts();
    const fleetReasons = new Map<string, number>();
    const out = [];
    for (const p of props) {
      const list = await this.overviewImports(p.id, sHash);
      const latest = list[0] ?? null;
      const prev = list[1] ?? null;
      const last = latest
        ? await this.trend.findOne({
            where: { import_id: latest.id },
            order: { date: 'DESC' },
          })
        : null;
      const prevLast = prev
        ? await this.trend.findOne({
            where: { import_id: prev.id },
            order: { date: 'DESC' },
          })
        : null;
      const reasons = latest
        ? await this.reasons.find({
            where: { import_id: latest.id },
            order: { pages: 'DESC' },
          })
        : [];
      const topDefect =
        reasons.find((r) => reasonIntent(r.reason) === 'likely_defect') ?? null;
      const summary = await this.inspectionSummary(p);
      // automatic view: what URL Inspection says for the URLs tracked on this property
      const states = liveByProperty.get(p.id) ?? [];
      const notIndexedStates = states
        .filter((x) => !isIndexedCoverage(x.coverage_state))
        .sort((a, b) => b.urls - a.urls);
      const critical = notIndexedStates.filter(
        (x) => reasonIntent(x.coverage_state) === 'likely_defect',
      );
      for (const x of notIndexedStates)
        fleetReasons.set(
          x.coverage_state,
          (fleetReasons.get(x.coverage_state) ?? 0) + x.urls,
        );
      out.push({
        live: states.length
          ? {
              indexed: states
                .filter((x) => isIndexedCoverage(x.coverage_state))
                .reduce((a, x) => a + x.urls, 0),
              not_indexed: notIndexedStates.reduce((a, x) => a + x.urls, 0),
              critical: critical.reduce((a, x) => a + x.urls, 0),
              top_critical: critical[0]
                ? {
                    reason: critical[0].coverage_state,
                    pages: critical[0].urls,
                  }
                : null,
            }
          : null,
        property: {
          id: p.id,
          site_url: p.site_url,
          display_name: p.display_name,
          status: p.status,
        },
        report_date: latest?.report_date ?? null,
        stale: latest
          ? daysSince(latest.report_date) > INDEXING_STALE_DAYS
          : null,
        indexed: last?.indexed ?? null,
        not_indexed: last?.not_indexed ?? null,
        previous_indexed: prevLast?.indexed ?? null,
        previous_not_indexed: prevLast?.not_indexed ?? null,
        defect_pages: reasons
          .filter((r) => reasonIntent(r.reason) === 'likely_defect')
          .reduce((a, r) => a + r.pages, 0),
        top_defect: topDefect
          ? {
              reason: topDefect.reason,
              pages: topDefect.pages,
              reason_hash: topDefect.reason_hash,
            }
          : null,
        inspected_urls: summary.inspected_urls,
        indexed_urls: summary.indexed_urls,
        tracked_urls: summary.tracked_urls,
        running: summary.running,
        last_inspection_run:
          summary.last_run?.finished_at ?? summary.last_run?.started_at ?? null,
        last_run_status: summary.last_run?.status ?? null,
        stop_reason: summary.last_run?.stop_reason ?? null,
        sitemaps: summary.sitemaps.length,
      });
    }
    return {
      items: out,
      stale_days: INDEXING_STALE_DAYS,
      // not-indexed URLs of the whole fleet by Google reason (URL Inspection)
      reasons: [...fleetReasons.entries()]
        .map(([reason, pages]) => ({
          reason,
          pages,
          intent: reasonIntent(reason),
        }))
        .sort((a, b) => b.pages - a.pages),
      batch: this.collector.batchStatus(),
      daily_budget: this.collector.getDailyBudget(),
    };
  }

  /** Data the opportunities scan and reports need (latest two All-known imports + URL facts). */
  async scanInput(propertyId: number) {
    const sHash = scopeHash('all_known', null);
    const list = await this.overviewImports(propertyId, sHash);
    const reasonsByImport = new Map<number, IndexingReason[]>();
    for (const imp of list.slice(0, 6)) {
      reasonsByImport.set(
        imp.id,
        await this.reasons.find({ where: { import_id: imp.id } }),
      );
    }
    const lastTrend = async (imp?: IndexingImport) =>
      imp
        ? await this.trend.findOne({
            where: { import_id: imp.id },
            order: { date: 'DESC' },
          })
        : null;
    const notIndexedSitemap: {
      url: string;
      coverage_state: string | null;
      inspected_at: Date;
      verdict: string | null;
      sitemap: string | null;
    }[] = await this.db.query(
      `SELECT t.url, t.sitemap, i.coverage_state, i.inspected_at, i.verdict
           FROM tracked_urls t
           JOIN (SELECT url_hash, MAX(id) AS id FROM url_inspections WHERE property_id = ? AND error IS NULL GROUP BY url_hash) l ON l.url_hash = t.url_hash
           JOIN url_inspections i ON i.id = l.id
          WHERE t.property_id = ? AND t.in_sitemap = 1`,
      [propertyId, propertyId],
    );
    const examples = new Map<
      string,
      { urls: string[]; partial: boolean; report_date: string }
    >();
    const issueImports = await this.imports.find({
      where: {
        property_id: propertyId,
        report_kind: 'issue',
        scope_hash: sHash,
      },
      order: { report_date: 'DESC' },
    });
    for (const ii of issueImports) {
      if (!ii.issue_reason_hash || examples.has(ii.issue_reason_hash)) continue;
      const ex = await this.examples.find({
        where: { import_id: ii.id },
        take: 10,
      });
      examples.set(ii.issue_reason_hash, {
        urls: ex.map((e) => e.url),
        partial: ii.examples_partial,
        report_date: ii.report_date,
      });
    }
    return {
      imports: list.slice(0, 6).map((imp) => ({
        id: imp.id,
        report_date: imp.report_date,
        reasons: (reasonsByImport.get(imp.id) ?? []).map((r) => ({
          reason: r.reason,
          reason_hash: r.reason_hash,
          pages: r.pages,
          source: r.source,
          group: r.reason_group,
          intent: reasonIntent(r.reason),
        })),
      })),
      latestTotals: await lastTrend(list[0]),
      previousTotals: await lastTrend(list[1]),
      sitemapUrls: notIndexedSitemap.filter(
        (u) => !isIndexedCoverage(u.coverage_state),
      ),
      examples,
    };
  }
}

export { md5 };
