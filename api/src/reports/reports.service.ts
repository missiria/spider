import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Dimension } from '../metrics/entities/dimension-metric.entity';
import { KeyTotals } from '../metrics/dimension.math';
import { MetricTotals, Period, defaultEndDate } from '../metrics/metrics.math';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { OverviewService, resolvePeriod } from '../overview/overview.service';
import { PropertiesService } from '../properties/properties.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { MailerService } from '../integrations/mailer.service';
import { WebhooksService } from '../integrations/webhooks.service';
import { ReportDelivery } from './entities/report-delivery.entity';
import {
  ReportSchedule,
  ScheduleFrequency,
} from './entities/report-schedule.entity';
import {
  Report,
  REPORT_SECTIONS,
  ReportConfig,
  ReportSection,
} from './entities/report.entity';
import { buildReportDocument } from './report-pdf';
import { IndexingService } from '../indexing/indexing.service';
import { INDEXING_RULES } from '../opportunities/entities/opportunity.entity';
import { parseBrand } from '../workspaces/brand';
import { nextRunAt, parseRecipients, periodKey, toCsv } from './report.util';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require('pdfmake/build/vfs_fonts');

export interface ReportTable {
  section: ReportSection;
  title: string;
  keyLabel: string;
  note: string | null;
  rows: KeyTotals[];
}

/**
 * Page indexing of one property for a report (MITP-0833, ADR-0009). Report-wide numbers come
 * from the uploaded Search Console export of ONE view; URL Inspection numbers cover Spider's
 * tracked URLs only. Every export prints `source`, `report_date` and `completeness`.
 */
export interface IndexingReportBlock {
  property: { id: number; display_name: string; site_url: string };
  view: string;
  source: string;
  report_date: string | null;
  stale: boolean;
  days_old: number | null;
  completeness: string;
  totals: {
    indexed: number | null;
    not_indexed: number | null;
    previous_indexed: number | null;
    previous_not_indexed: number | null;
    previous_date: string | null;
  } | null;
  reasons: {
    reason: string;
    source: string | null;
    group: string;
    intent: string;
    validation: string | null;
    pages: number;
    previous_pages: number | null;
    first_seen: string;
  }[];
  trend: { date: string; indexed: number | null; not_indexed: number | null }[];
  inspection: {
    tracked_urls: number;
    inspected_urls: number;
    indexed_urls: number;
    last_run_at: string | null;
    last_run_status: string | null;
    stop_reason: string | null;
  };
  /**
   * Automatic view: latest URL Inspection result of every tracked URL. A separate source from
   * the imported report above; null until the property has been inspected.
   */
  live: {
    source: string;
    last_update: string;
    completeness: string;
    indexed: number;
    not_indexed: number;
    reasons: {
      reason: string;
      source: string;
      intent: string;
      pages: number;
    }[];
  } | null;
}

export const INDEXING_LIVE_SOURCE = 'Google URL Inspection API (automatic)';

export const INDEXING_SOURCE =
  'Search Console Page indexing report (uploaded export)';

export interface ReportData {
  report_id: number;
  title: string;
  scope: 'fleet' | 'property';
  property: { id: number; display_name: string; site_url: string } | null;
  generated_at: string;
  data_through: string | null;
  period: Period;
  previousPeriod: Period;
  notes: string | null;
  overview: {
    current: MetricTotals;
    previous: MetricTotals;
    delta: {
      clicks: number | null;
      impressions: number | null;
      ctr: number | null;
      position: number | null;
    };
    /** false when the comparison period has no stored rows (previous is then zeros, not data) */
    comparison_available?: boolean;
    /** what the KPIs are computed from when a filter is active */
    note?: string | null;
    properties?: {
      id: number;
      display_name: string;
      current: MetricTotals;
      previous: MetricTotals;
      delta: { clicks: number | null; impressions: number | null };
    }[];
  } | null;
  tables: ReportTable[];
  opportunities:
    | {
        id: number;
        priority: string;
        title: string;
        property: string;
        confidence: string;
        rule: string;
      }[]
    | null;
  /** absent on reports without the indexing section */
  indexing?: {
    blocks: IndexingReportBlock[];
    opportunities: {
      id: number;
      priority: string;
      title: string;
      property: string;
      confidence: string;
      rule: string;
    }[];
  } | null;
}

/** Tables of the property page that have an Export menu (MISS-0171). */
export const PROPERTY_EXPORT_SECTIONS = [
  'pages',
  'queries',
  'countries',
  'devices',
  'search_appearance',
  // Page indexing page (MITP-0833): reasons + totals, and the chart rows
  'indexing',
  'indexing_trend',
] as const;
export type PropertyExportSection = (typeof PROPERTY_EXPORT_SECTIONS)[number];
export interface PropertyExportFilters {
  include_query?: string;
  exclude_query?: string;
  include_page?: string;
  exclude_page?: string;
  country?: string;
  device?: string;
}

const SECTION_TITLES: Record<
  Exclude<ReportSection, 'overview' | 'opportunities' | 'indexing'>,
  { title: string; keyLabel: string; dimension: Dimension }
> = {
  pages: { title: 'Top pages', keyLabel: 'Page', dimension: 'page' },
  queries: { title: 'Top queries', keyLabel: 'Query', dimension: 'query' },
  countries: { title: 'Countries', keyLabel: 'Country', dimension: 'country' },
  devices: { title: 'Devices', keyLabel: 'Device', dimension: 'device' },
  search_appearance: {
    title: 'Search appearance',
    keyLabel: 'Appearance',
    dimension: 'search_appearance',
  },
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly publicUrl: string;
  private readonly printer: InstanceType<typeof PdfPrinter>;

  constructor(
    @InjectRepository(Report) private readonly repo: Repository<Report>,
    @InjectRepository(ReportSchedule)
    private readonly schedules: Repository<ReportSchedule>,
    @InjectRepository(ReportDelivery)
    private readonly deliveries: Repository<ReportDelivery>,
    private readonly overview: OverviewService,
    private readonly opportunities: OpportunitiesService,
    private readonly indexing: IndexingService,
    private readonly properties: PropertiesService,
    private readonly workspaces: WorkspacesService,
    private readonly mailer: MailerService,
    private readonly webhooks: WebhooksService,
    config: ConfigService,
  ) {
    this.publicUrl = (config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
    const vfs = vfsFonts.pdfMake
      ? vfsFonts.pdfMake.vfs
      : (vfsFonts.vfs ?? vfsFonts);
    this.printer = new PdfPrinter({
      Roboto: {
        normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
        bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
        italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
        bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
      },
    });
  }

  // ---- templates -------------------------------------------------------

  present(r: Report) {
    return { ...r, config: normalizeConfig(safeParse(r.config, {})) };
  }

  async list() {
    const ws = await this.workspaces.current();
    const items = await this.repo.find({
      where: { workspace_id: ws.id },
      order: { name: 'ASC' },
    });
    const schedules = await this.schedules.find({
      where: { workspace_id: ws.id },
    });
    return {
      items: items.map((r) => ({
        ...this.present(r),
        schedules: schedules
          .filter((s) => s.report_id === r.id)
          .map((s) => this.presentSchedule(s)),
      })),
      mail_configured: this.mailer.isConfigured(),
    };
  }

  async create(
    userId: number,
    input: {
      name: string;
      scope: 'fleet' | 'property';
      property_id?: number;
      config: unknown;
    },
  ) {
    const ws = await this.workspaces.current();
    if (input.scope === 'property') {
      if (!input.property_id)
        throw new BadRequestException(
          'property_id is required for a property report',
        );
      await this.properties.get(input.property_id);
    }
    const r = await this.repo.save(
      this.repo.create({
        workspace_id: ws.id,
        created_by: userId,
        name: input.name.trim(),
        scope: input.scope,
        property_id:
          input.scope === 'property' ? (input.property_id ?? null) : null,
        config: JSON.stringify(normalizeConfig(input.config)),
      }),
    );
    return this.present(r);
  }

  async update(id: number, input: { name?: string; config?: unknown }) {
    const r = await this.find(id);
    if (input.name !== undefined) r.name = input.name.trim();
    if (input.config !== undefined)
      r.config = JSON.stringify(normalizeConfig(input.config));
    return this.present(await this.repo.save(r));
  }

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.find(id));
  }

  // ---- rendering -------------------------------------------------------

  async data(id: number): Promise<ReportData> {
    const r = await this.find(id);
    const cfg = normalizeConfig(safeParse(r.config, {}));
    const period = resolvePeriod(cfg.period);
    const title = r.name;
    const generated_at = new Date().toISOString();
    const base: ReportData = {
      report_id: r.id,
      title,
      scope: r.scope,
      property: null,
      generated_at,
      data_through: null,
      period,
      previousPeriod: period, // replaced below
      notes: cfg.notes ?? null,
      overview: null,
      tables: [],
      opportunities: null,
    };

    if (r.scope === 'fleet') {
      const fleet = await this.overview.fleet(cfg.period);
      base.previousPeriod = fleet.previousPeriod;
      base.data_through = fleet.coverage.dataThrough;
      if (cfg.sections.includes('overview')) {
        base.overview = {
          current: fleet.totals.current,
          previous: fleet.totals.previous,
          delta: { ...fleet.totals.delta, ctr: null, position: null },
          properties: fleet.items.map((p) => ({
            id: p.id,
            display_name: p.display_name,
            current: p.current,
            previous: p.previous,
            delta: { clicks: p.delta.clicks, impressions: p.delta.impressions },
          })),
        };
      }
      if (cfg.sections.includes('opportunities')) {
        base.opportunities = await this.openOpportunities(undefined, cfg.limit);
      }
      if (cfg.sections.includes('indexing')) {
        const blocks: IndexingReportBlock[] = [];
        for (const p of fleet.items)
          blocks.push(await this.indexingBlock(p.id, cfg.limit));
        base.indexing = {
          blocks,
          opportunities: await this.indexingOpportunities(undefined, cfg.limit),
        };
      }
      return base;
    }

    return this.fillProperty(base, r.property_id as number, cfg);
  }

  /**
   * One property table (or several) for the period and filters on screen, without a saved
   * report (MISS-0171): the property page's Export menu. Same builder, brand and limits as a
   * report, so the PDF and CSV look exactly like report exports.
   */
  async propertyExport(
    propertyId: number,
    section: PropertyExportSection,
    period: { days?: number; start?: string; end?: string },
    filters: PropertyExportFilters,
    rowLimit: number,
    view: { scope?: string; sitemap?: string } = {},
  ): Promise<ReportData> {
    const property = await this.properties.get(propertyId); // tenant-scoped: 404 outside the workspace
    if (section === 'indexing' || section === 'indexing_trend') {
      const block = await this.indexingBlock(
        property.id,
        rowLimit,
        view.scope,
        view.sitemap,
      );
      const today = new Date().toISOString().slice(0, 10);
      const day = block.report_date ?? today;
      return {
        report_id: 0,
        title: `${property.display_name} · Page indexing`,
        scope: 'property',
        property: {
          id: property.id,
          display_name: property.display_name,
          site_url: property.site_url,
        },
        generated_at: new Date().toISOString(),
        data_through: block.report_date,
        period: { start: block.trend[0]?.date ?? day, end: day },
        previousPeriod: { start: day, end: day },
        notes: null,
        overview: null,
        tables: [],
        opportunities: null,
        indexing: {
          blocks: [block],
          opportunities: await this.indexingOpportunities(
            property.id,
            rowLimit,
          ),
        },
      };
    }
    const meta = SECTION_TITLES[section];
    const base: ReportData = {
      report_id: 0,
      title: `${property.display_name} · ${meta.title}`,
      scope: 'property',
      property: null,
      generated_at: new Date().toISOString(),
      data_through: null,
      period: resolvePeriod(period),
      previousPeriod: resolvePeriod(period),
      notes: null,
      overview: null,
      tables: [],
      opportunities: null,
    };
    return this.fillProperty(
      base,
      propertyId,
      { period, sections: ['overview', section], limit: rowLimit, filters },
      filters,
    );
  }

  private async fillProperty(
    base: ReportData,
    propertyId: number,
    cfg: {
      period: { days?: number; start?: string; end?: string };
      sections: ReportSection[];
      limit: number;
      filters?: ReportConfig['filters'];
    },
    keyFilters: PropertyExportFilters = {},
  ): Promise<ReportData> {
    const property = await this.properties.get(propertyId);
    base.property = {
      id: property.id,
      display_name: property.display_name,
      site_url: property.site_url,
    };
    const detail = await this.overview.propertyDetail(property, cfg.period, {
      ...(cfg.filters ?? {}),
      ...keyFilters,
    });
    base.previousPeriod = detail.previousPeriod;
    base.data_through = detail.series.length
      ? detail.series[detail.series.length - 1].date
      : null;
    if (cfg.sections.includes('overview')) {
      // a period without stored rows for the comparison reports zeros + explicit flag, never a guess
      base.overview = {
        current: detail.kpi.current,
        previous: detail.kpi.previous ?? {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
        },
        delta: detail.kpi.delta,
        comparison_available: detail.kpi.comparison.available,
        note: detail.kpi.note,
      };
    }
    for (const section of cfg.sections) {
      if (
        section === 'overview' ||
        section === 'opportunities' ||
        section === 'indexing'
      )
        continue;
      const meta = SECTION_TITLES[section];
      const b = detail.breakdowns[meta.dimension];
      const cov = b?.coverage.clicks;
      const noteParts: string[] = [];
      if (b?.unavailable) noteParts.push(b.unavailable.message);
      if (detail.coverage.unreliable.includes(meta.dimension))
        noteParts.push(
          'INCOMPLETE: the last sync could not store every row for this dimension',
        );
      if (b?.stored)
        noteParts.push(
          `${b.days} day${b.days === 1 ? '' : 's'} stored (${b.stored.start} → ${b.stored.end})`,
        );
      if (cov !== null && cov !== undefined) {
        if (section === 'queries')
          noteParts.push(
            `query rows explain ${Math.round(cov * 100)}% of clicks; Google hides low-volume queries`,
          );
        else if (section === 'search_appearance')
          noteParts.push(
            `${Math.round(cov * 100)}% of clicks came from results with a special appearance`,
          );
        else if (cov < 0.98)
          noteParts.push(`rows explain ${Math.round(cov * 100)}% of clicks`);
      }
      if (b?.filters)
        noteParts.push(
          `filter: ${b.filters.include ? `/${b.filters.include}/` : ''}${b.filters.exclude ? ` not /${b.filters.exclude}/` : ''}${b.filters.keys ? b.filters.keys.join(', ') : ''}`.trim(),
        );
      base.tables.push({
        section,
        title: meta.title,
        keyLabel: meta.keyLabel,
        note: noteParts.length ? noteParts.join(' · ') : null,
        rows: (b?.rows ?? []).slice(0, cfg.limit),
      });
    }
    if (cfg.sections.includes('opportunities')) {
      base.opportunities = await this.openOpportunities(property.id, cfg.limit);
    }
    if (cfg.sections.includes('indexing')) {
      base.indexing = {
        blocks: [await this.indexingBlock(property.id, cfg.limit)],
        opportunities: await this.indexingOpportunities(property.id, cfg.limit),
      };
    }
    return base;
  }

  /** One property's Page indexing summary for one report view (default: All known pages). */
  private async indexingBlock(
    propertyId: number,
    limit: number,
    scope?: string,
    sitemap?: string,
  ): Promise<IndexingReportBlock> {
    const d = await this.indexing.propertyIndexing(propertyId, scope, sitemap);
    const view =
      d.scope.scope === 'submitted'
        ? 'All submitted pages'
        : d.scope.scope === 'sitemap'
          ? `Sitemap: ${d.scope.scope_detail ?? ''}`
          : 'All known pages';
    const insp = d.inspection;
    const parts: string[] = [];
    if (!d.report)
      parts.push(
        'No Page indexing report imported for this view: no report-wide counts',
      );
    else {
      parts.push(
        `Report-wide counts as exported on ${d.report.report_date}; example URL lists are capped at 1,000 rows per reason by Search Console`,
      );
      if (d.report.stale)
        parts.push(`STALE: the report is ${d.report.days_old} days old`);
      if (d.reasons.length > limit)
        parts.push(`first ${limit} of ${d.reasons.length} reasons`);
    }
    parts.push(
      insp.tracked_urls
        ? `URL Inspection: ${insp.inspected_urls} of ${insp.tracked_urls} tracked URLs inspected (tracked URLs are not all pages Google knows)`
        : 'URL Inspection: no tracked URLs yet',
    );
    if (insp.last_run?.stop_reason === 'quota')
      parts.push('last inspection run stopped at the daily quota');
    if (insp.last_run?.stop_reason === 'permission_denied')
      parts.push('last inspection run was refused by Search Console (403)');
    const at = insp.last_run?.finished_at ?? insp.last_run?.started_at ?? null;
    return {
      property: d.property,
      view,
      source: INDEXING_SOURCE,
      report_date: d.report?.report_date ?? null,
      stale: d.report?.stale ?? false,
      days_old: d.report?.days_old ?? null,
      completeness: parts.join(' · '),
      totals: d.totals
        ? {
            indexed: d.totals.indexed,
            not_indexed: d.totals.not_indexed,
            previous_indexed: d.totals.previous_indexed,
            previous_not_indexed: d.totals.previous_not_indexed,
            previous_date: d.totals.previous_date,
          }
        : null,
      reasons: d.reasons.slice(0, limit).map((r) => ({
        reason: r.reason,
        source: r.source,
        group: r.group,
        intent: r.intent,
        validation: r.validation,
        pages: r.pages,
        previous_pages: r.previous_pages,
        first_seen: r.first_seen,
      })),
      trend: d.trend.map((t) => ({
        date: t.date,
        indexed: t.indexed,
        not_indexed: t.not_indexed,
      })),
      inspection: {
        tracked_urls: insp.tracked_urls,
        inspected_urls: insp.inspected_urls,
        indexed_urls: insp.indexed_urls,
        last_run_at: at ? new Date(at).toISOString() : null,
        last_run_status: insp.last_run?.status ?? null,
        stop_reason: insp.last_run?.stop_reason ?? null,
      },
      live:
        d.live.totals && d.live.last_update
          ? {
              source: INDEXING_LIVE_SOURCE,
              last_update: d.live.last_update,
              completeness: `${d.live.inspected_urls} of ${d.live.tracked_urls} tracked URLs inspected (sitemaps and pages with impressions); not every page Google knows`,
              indexed: d.live.totals.indexed,
              not_indexed: d.live.totals.not_indexed,
              reasons: d.live.reasons
                .filter((r) => r.group === 'not_indexed' && r.pages > 0)
                .slice(0, limit)
                .map((r) => ({
                  reason: r.reason,
                  source: r.source,
                  intent: r.intent,
                  pages: r.pages,
                })),
            }
          : null,
    };
  }

  private async indexingOpportunities(
    propertyId: number | undefined,
    limit: number,
  ) {
    const all = await this.openOpportunities(propertyId, 10_000);
    return all
      .filter((o) => (INDEXING_RULES as readonly string[]).includes(o.rule))
      .slice(0, limit);
  }

  private async openOpportunities(
    propertyId: number | undefined,
    limit: number,
  ) {
    const list = await this.opportunities.list({
      status: 'active',
      property_id: propertyId,
    });
    const props = await this.properties.list();
    const name = new Map(props.map((p) => [p.id, p.display_name]));
    return list.items.slice(0, limit).map((o) => ({
      id: o.id,
      priority: o.priority,
      title: o.title,
      property: name.get(o.property_id) ?? String(o.property_id),
      confidence: o.confidence,
      rule: o.rule,
    }));
  }

  csv(
    data: ReportData,
    section: string,
  ): { filename: string; content: string } {
    const slug =
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'report';
    const stamp = data.period.end;
    if (section === 'overview') {
      if (!data.overview)
        throw new BadRequestException('Section not in this report');
      const noPrev = data.overview.comparison_available === false;
      const rows: (string | number | null)[][] = data.overview.properties
        ? data.overview.properties.map((p) => [
            p.display_name,
            p.current.clicks,
            p.previous.clicks,
            p.delta.clicks,
            p.current.impressions,
            p.previous.impressions,
            p.delta.impressions,
            p.current.ctr,
            p.current.position,
          ])
        : [
            // no stored comparison rows → previous and deltas are blank, not zeros
            [
              data.property?.display_name ?? 'property',
              data.overview.current.clicks,
              noPrev ? null : data.overview.previous.clicks,
              noPrev ? null : data.overview.delta.clicks,
              data.overview.current.impressions,
              noPrev ? null : data.overview.previous.impressions,
              noPrev ? null : data.overview.delta.impressions,
              data.overview.current.ctr,
              data.overview.current.position,
            ],
          ];
      return {
        filename: `${slug}-overview-${stamp}.csv`,
        content: toCsv(
          [
            'site',
            'clicks',
            'clicks_previous',
            'clicks_delta',
            'impressions',
            'impressions_previous',
            'impressions_delta',
            'ctr',
            'position',
          ],
          rows,
        ),
      };
    }
    if (section === 'opportunities') {
      if (!data.opportunities)
        throw new BadRequestException('Section not in this report');
      return {
        filename: `${slug}-opportunities-${stamp}.csv`,
        content: toCsv(
          ['id', 'priority', 'rule', 'confidence', 'property', 'title', 'url'],
          data.opportunities.map((o) => [
            o.id,
            o.priority,
            o.rule,
            o.confidence,
            o.property,
            o.title,
            `${this.publicUrl}/opportunities/${o.id}`,
          ]),
        ),
      };
    }
    if (section === 'indexing' || section === 'indexing_trend') {
      if (!data.indexing)
        throw new BadRequestException('Section not in this report');
      // every row repeats the view, report date, source and completeness of its numbers
      const meta = (b: IndexingReportBlock) => [
        b.property.site_url,
        b.view,
        b.report_date,
        b.source,
        b.completeness,
      ];
      const head = ['site', 'view', 'report_date', 'source', 'completeness'];
      const day = new Date().toISOString().slice(0, 10);
      if (section === 'indexing_trend')
        return {
          filename: `${slug}-indexing-trend-${day}.csv`,
          content: toCsv(
            [...head, 'date', 'indexed', 'not_indexed'],
            data.indexing.blocks.flatMap((b) =>
              b.trend.map((t) => [
                ...meta(b),
                t.date,
                t.indexed,
                t.not_indexed,
              ]),
            ),
          ),
        };
      const rows: (string | number | null)[][] = [];
      for (const b of data.indexing.blocks) {
        if (b.totals) {
          rows.push([
            ...meta(b),
            'total',
            'indexed',
            'Indexed',
            null,
            null,
            null,
            b.totals.indexed,
            b.totals.previous_indexed,
            null,
          ]);
          rows.push([
            ...meta(b),
            'total',
            'not_indexed',
            'Not indexed',
            null,
            null,
            null,
            b.totals.not_indexed,
            b.totals.previous_not_indexed,
            null,
          ]);
        } else if (!b.reasons.length && !b.live) {
          // a property without a report still appears, with its completeness note
          rows.push([
            ...meta(b),
            'none',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ]);
        }
        for (const r of b.reasons)
          rows.push([
            ...meta(b),
            'reason',
            r.group,
            r.reason,
            r.source,
            r.intent,
            r.validation,
            r.pages,
            r.previous_pages,
            r.first_seen,
          ]);
        // automatic view: its own view, date, source and completeness on every row
        if (b.live) {
          const live = [
            b.property.site_url,
            'Tracked URLs (automatic)',
            b.live.last_update,
            b.live.source,
            b.live.completeness,
          ];
          rows.push([
            ...live,
            'total',
            'indexed',
            'Indexed',
            null,
            null,
            null,
            b.live.indexed,
            null,
            null,
          ]);
          rows.push([
            ...live,
            'total',
            'not_indexed',
            'Not indexed',
            null,
            null,
            null,
            b.live.not_indexed,
            null,
            null,
          ]);
          for (const r of b.live.reasons)
            rows.push([
              ...live,
              'reason',
              'not_indexed',
              r.reason,
              r.source,
              r.intent,
              null,
              r.pages,
              null,
              null,
            ]);
        }
      }
      return {
        filename: `${slug}-indexing-${day}.csv`,
        content: toCsv(
          [
            ...head,
            'row_type',
            'group',
            'reason',
            'reason_source',
            'classification',
            'validation',
            'pages',
            'pages_previous_report',
            'first_seen_in_spider',
          ],
          rows,
        ),
      };
    }
    const table = data.tables.find((t) => t.section === section);
    if (!table) throw new BadRequestException('Section not in this report');
    return {
      filename: `${slug}-${section}-${stamp}.csv`,
      content: toCsv(
        [
          table.keyLabel.toLowerCase(),
          'clicks',
          'impressions',
          'ctr',
          'position',
        ],
        table.rows.map((r) => [
          r.key,
          r.clicks,
          r.impressions,
          r.ctr,
          r.position,
        ]),
      ),
    };
  }

  async pdf(data: ReportData): Promise<{ filename: string; buffer: Buffer }> {
    // the current workspace's own profile and logo only (tenant scope from the request / runAs)
    const ws = await this.workspaces.current();
    const brand = parseBrand(ws.brand);
    const logo = await this.workspaces.logo();
    const doc = this.printer.createPdfKitDocument(
      buildReportDocument(data, brand, logo),
    );
    const chunks: Buffer[] = [];
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
    const slug =
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'report';
    return { filename: `${slug}-${data.period.end}.pdf`, buffer };
  }

  // ---- schedules -------------------------------------------------------

  presentSchedule(s: ReportSchedule) {
    return { ...s, recipients: safeParse<string[]>(s.recipients, []) };
  }

  async createSchedule(
    reportId: number,
    input: {
      frequency: ScheduleFrequency;
      day?: number;
      hour?: number;
      recipients: unknown;
    },
  ) {
    const r = await this.find(reportId);
    const recipients = parseRecipients(input.recipients);
    if (!recipients.length)
      throw new BadRequestException(
        'At least one valid recipient email is required',
      );
    const day = clamp(input.day ?? 1, 1, input.frequency === 'weekly' ? 7 : 28);
    const hour = clamp(input.hour ?? 7, 0, 23);
    const s = await this.schedules.save(
      this.schedules.create({
        workspace_id: r.workspace_id,
        report_id: r.id,
        frequency: input.frequency,
        day,
        hour,
        recipients: JSON.stringify(recipients),
        enabled: true,
        next_run_at: nextRunAt(input.frequency, day, hour, new Date()),
      }),
    );
    return this.presentSchedule(s);
  }

  async updateSchedule(
    id: number,
    input: {
      frequency?: ScheduleFrequency;
      day?: number;
      hour?: number;
      recipients?: unknown;
      enabled?: boolean;
    },
  ) {
    const s = await this.findSchedule(id);
    if (input.frequency !== undefined) s.frequency = input.frequency;
    if (input.day !== undefined)
      s.day = clamp(input.day, 1, s.frequency === 'weekly' ? 7 : 28);
    if (input.hour !== undefined) s.hour = clamp(input.hour, 0, 23);
    if (input.recipients !== undefined) {
      const list = parseRecipients(input.recipients);
      if (!list.length)
        throw new BadRequestException(
          'At least one valid recipient email is required',
        );
      s.recipients = JSON.stringify(list);
    }
    if (input.enabled !== undefined) s.enabled = input.enabled;
    s.next_run_at = s.enabled
      ? nextRunAt(s.frequency, s.day, s.hour, new Date())
      : null;
    return this.presentSchedule(await this.schedules.save(s));
  }

  async removeSchedule(id: number): Promise<void> {
    await this.schedules.remove(await this.findSchedule(id));
  }

  async scheduleDeliveries(id: number) {
    await this.findSchedule(id);
    const items = await this.deliveries.find({
      where: { schedule_id: id },
      order: { created_at: 'DESC' },
      take: 24,
    });
    return {
      items: items.map((d) => ({
        ...d,
        recipients: safeParse<string[]>(d.recipients, []),
      })),
    };
  }

  /** Worker: run every due schedule once per period slot (unique (schedule, period_key)). */
  async runDueSchedules(now = new Date()): Promise<{
    due: number;
    sent: number;
    skipped: number;
    failed: number;
    duplicate: number;
  }> {
    const due = await this.schedules.find({
      where: { enabled: true, next_run_at: LessThanOrEqual(now) },
    });
    const result = {
      due: due.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      duplicate: 0,
    };
    for (const s of due) {
      // the worker has no request: scope every schedule to its own workspace (ADR-0007)
      const outcome = await this.workspaces.runAs(s.workspace_id, () =>
        this.runSchedule(s, now),
      );
      result[outcome] += 1;
    }
    return result;
  }

  /** Manual "send now" ignores the slot dedupe by using a timestamped key. */
  async sendNow(id: number) {
    const s = await this.findSchedule(id);
    // 'm' + base36 timestamp ≈ 9 chars, fits period_key varchar(16)
    const outcome = await this.runSchedule(
      s,
      new Date(),
      `m${Date.now().toString(36)}`,
    );
    return {
      outcome,
      schedule: this.presentSchedule(await this.findSchedule(id)),
    };
  }

  private async runSchedule(
    s: ReportSchedule,
    now: Date,
    keyOverride?: string,
  ): Promise<'sent' | 'skipped' | 'failed' | 'duplicate'> {
    const key = keyOverride ?? periodKey(s.frequency, now);
    const recipients = safeParse<string[]>(s.recipients, []);
    let delivery: ReportDelivery;
    try {
      delivery = await this.deliveries.save(
        this.deliveries.create({
          schedule_id: s.id,
          period_key: key,
          status: 'skipped',
          recipients: JSON.stringify(recipients),
          attempts: 1,
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        // already delivered for this slot: just move the schedule forward
        s.next_run_at = nextRunAt(s.frequency, s.day, s.hour, now);
        await this.schedules.save(s);
        return 'duplicate';
      }
      throw err;
    }
    try {
      const data = await this.data(s.report_id);
      const pdf = await this.pdf(data);
      const csvSections = [
        ...(data.overview ? ['overview'] : []),
        ...data.tables.map((t) => t.section),
        ...(data.opportunities ? ['opportunities'] : []),
      ];
      const attachments = [
        {
          filename: pdf.filename,
          content: pdf.buffer,
          contentType: 'application/pdf',
        },
        ...csvSections.map((sec) => {
          const c = this.csv(data, sec);
          return {
            filename: c.filename,
            content: c.content,
            contentType: 'text/csv; charset=utf-8',
          };
        }),
      ];
      const subject = `${data.title} · ${data.period.start} → ${data.period.end}`;
      const summary = data.overview
        ? `Clicks ${Math.round(data.overview.current.clicks)} (prev ${Math.round(data.overview.previous.clicks)}), impressions ${Math.round(data.overview.current.impressions)} (prev ${Math.round(data.overview.previous.impressions)}).`
        : '';
      const res = await this.mailer.send({
        to: recipients,
        subject,
        text: `${data.title}\nPeriod ${data.period.start} → ${data.period.end} vs ${data.previousPeriod.start} → ${data.previousPeriod.end}\nGSC data through ${data.data_through ?? 'n/a'}\n\n${summary}\n\nThe PDF and CSV files are attached.${this.publicUrl ? `\n${this.publicUrl}/reports/${s.report_id}` : ''}`,
        attachments,
      });
      delivery.subject = subject;
      delivery.status = res.skipped ? 'skipped' : 'sent';
      delivery.error = res.skipped ? 'SMTP not configured' : null;
      await this.webhooks.emit(
        'report.generated',
        `report:${s.report_id}:${key}`,
        {
          report_id: s.report_id,
          title: data.title,
          period: data.period,
          data_through: data.data_through,
          recipients,
          delivery: delivery.status,
          url: `${this.publicUrl}/reports/${s.report_id}`,
        },
      );
    } catch (err) {
      delivery.status = 'failed';
      delivery.error = (err as Error).message.slice(0, 2000);
      this.logger.error(`schedule ${s.id} failed: ${delivery.error}`);
    }
    await this.deliveries.save(delivery);
    s.last_run_at = now;
    s.last_status = delivery.status;
    s.last_error = delivery.error;
    s.next_run_at = nextRunAt(s.frequency, s.day, s.hour, now);
    await this.schedules.save(s);
    return delivery.status;
  }

  // ---- lookups ---------------------------------------------------------

  async find(id: number): Promise<Report> {
    const ws = await this.workspaces.current();
    const r = await this.repo.findOne({ where: { id, workspace_id: ws.id } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  private async findSchedule(id: number): Promise<ReportSchedule> {
    const ws = await this.workspaces.current();
    const s = await this.schedules.findOne({
      where: { id, workspace_id: ws.id },
    });
    if (!s) throw new NotFoundException('Schedule not found');
    return s;
  }
}

export function normalizeConfig(
  raw: unknown,
): Required<Pick<ReportConfig, 'period' | 'sections' | 'limit'>> &
  Pick<ReportConfig, 'filters' | 'notes'> {
  const p = (
    raw && typeof raw === 'object' ? raw : {}
  ) as Partial<ReportConfig>;
  const period =
    p.period && typeof p.period === 'object' ? p.period : { days: 28 };
  const sections = Array.isArray(p.sections)
    ? p.sections.filter((s): s is ReportSection =>
        (REPORT_SECTIONS as readonly string[]).includes(s as string),
      )
    : [];
  const f = p.filters && typeof p.filters === 'object' ? p.filters : undefined;
  return {
    period: {
      days: typeof period.days === 'number' ? period.days : undefined,
      start: typeof period.start === 'string' ? period.start : undefined,
      end: typeof period.end === 'string' ? period.end : undefined,
    },
    sections: sections.length ? sections : ['overview', 'pages', 'queries'],
    limit: clamp(typeof p.limit === 'number' ? p.limit : 50, 5, 500),
    filters: f
      ? {
          include_query: str(f.include_query),
          exclude_query: str(f.exclude_query),
          include_page: str(f.include_page),
          exclude_page: str(f.exclude_page),
        }
      : undefined,
    notes: typeof p.notes === 'string' ? p.notes.slice(0, 2000) : undefined,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export { defaultEndDate };
