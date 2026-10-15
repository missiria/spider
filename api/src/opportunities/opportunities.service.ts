import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GscService } from '../gsc/gsc.service';
import { DailyMetric } from '../metrics/entities/daily-metric.entity';
import { Dimension, DimensionMetric } from '../metrics/entities/dimension-metric.entity';
import { aggregateByKey, KeyTotals } from '../metrics/dimension.math';
import { addDays, aggregate, defaultEndDate, MetricTotals, Period, periodEndingOn, previousPeriod } from '../metrics/metrics.math';
import { Property } from '../properties/entities/property.entity';
import { PropertiesService } from '../properties/properties.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { OpportunityEvent, OpportunityEventType } from './entities/opportunity-event.entity';
import { OpportunityRulesConfig } from './entities/opportunity-rules.entity';
import {
  Opportunity,
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_STATUSES,
  OpportunityPriority,
  OpportunityStatus,
} from './entities/opportunity.entity';
import { mergeRules, RuleConfig } from './rules.config';
import { evaluate, Finding, fingerprint, priorityFromScore, ScanInput } from './rules.engine';

export interface ListFilter {
  status?: string;
  property_id?: number;
  rule?: string;
  priority?: string;
  assignee_id?: number;
  subject?: string;
}

export interface UpdateInput {
  status?: OpportunityStatus;
  priority?: OpportunityPriority;
  assignee_id?: number | null;
  due_date?: string | null;
  note?: string;
}

const IMPACT_DAYS = 14;

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private scanning = false;

  constructor(
    @InjectRepository(Opportunity) private readonly repo: Repository<Opportunity>,
    @InjectRepository(OpportunityEvent) private readonly events: Repository<OpportunityEvent>,
    @InjectRepository(OpportunityRulesConfig) private readonly rulesRepo: Repository<OpportunityRulesConfig>,
    @InjectRepository(DailyMetric) private readonly daily: Repository<DailyMetric>,
    @InjectRepository(DimensionMetric) private readonly dims: Repository<DimensionMetric>,
    private readonly properties: PropertiesService,
    private readonly workspaces: WorkspacesService,
    private readonly gsc: GscService,
  ) {}

  // ---- rules -----------------------------------------------------------

  async getRules(): Promise<RuleConfig> {
    const ws = await this.workspaces.current();
    const row = await this.rulesRepo.findOne({ where: { workspace_id: ws.id } });
    return mergeRules(row ? safeParse(row.config) : {});
  }

  async putRules(partial: unknown): Promise<RuleConfig> {
    const ws = await this.workspaces.current();
    const merged = mergeRules(partial);
    const row = (await this.rulesRepo.findOne({ where: { workspace_id: ws.id } })) ?? this.rulesRepo.create({ workspace_id: ws.id, config: '{}' });
    row.config = JSON.stringify(merged);
    await this.rulesRepo.save(row);
    return merged;
  }

  // ---- scan ------------------------------------------------------------

  isScanning(): boolean {
    return this.scanning;
  }

  /** Evaluate every connected property; returns counts. Safe to re-run: fingerprints dedupe. */
  async scan(): Promise<{ properties: number; created: number; updated: number; findings: number; skipped: number }> {
    if (this.scanning) {
      throw new BadRequestException('A scan is already running');
    }
    this.scanning = true;
    const result = { properties: 0, created: 0, updated: 0, findings: 0, skipped: 0 };
    try {
      const ws = await this.workspaces.current();
      const cfg = await this.getRules();
      const props = (await this.properties.list()).filter((p) => p.status === 'connected' && p.data_since);
      for (const property of props) {
        try {
          const findings = await this.evaluateProperty(property, cfg);
          result.findings += findings.length;
          const r = await this.persist(ws.id, property, findings, cfg);
          result.created += r.created;
          result.updated += r.updated;
          result.skipped += r.skipped;
          result.properties += 1;
        } catch (err) {
          this.logger.warn(`scan ${property.site_url}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.scanning = false;
    }
    this.logger.log(`scan: ${result.properties} properties, ${result.findings} findings, ${result.created} new, ${result.updated} refreshed`);
    return result;
  }

  private async evaluateProperty(property: Property, cfg: RuleConfig): Promise<Finding[]> {
    const end = defaultEndDate();
    const period = periodEndingOn(end, cfg.window_days);
    const previous = previousPeriod(period);
    const dailyRows = await this.daily.find({ where: { property_id: property.id } });
    const inRange = (d: string, p: Period) => d >= p.start && d <= p.end;
    const input: ScanInput = {
      period,
      previous,
      property: {
        current: aggregate(dailyRows.filter((r) => inRange(r.date, period))),
        previous: aggregate(dailyRows.filter((r) => inRange(r.date, previous))),
      },
      pages: {
        current: await this.keyTotals(property.id, 'page', period),
        previous: await this.keyTotals(property.id, 'page', previous),
      },
      queries: {
        current: await this.keyTotals(property.id, 'query', period),
        previous: await this.keyTotals(property.id, 'query', previous),
      },
      queryPages: [],
    };
    if (cfg.cannibalization.enabled) {
      try {
        const res = await this.gsc.queryAll(property.site_url, period.start, period.end, ['query', 'page']);
        input.queryPages = res.rows.map((r) => ({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }));
      } catch (err) {
        this.logger.warn(`query×page pull failed for ${property.site_url}: ${(err as Error).message}`);
      }
    }
    return evaluate(input, cfg);
  }

  private async keyTotals(propertyId: number, dimension: Dimension, period: Period): Promise<KeyTotals[]> {
    const rows = await this.dims
      .createQueryBuilder('m')
      .select(['m.key_text AS key_text', 'm.clicks AS clicks', 'm.impressions AS impressions', 'm.position AS position'])
      .where('m.property_id = :propertyId', { propertyId })
      .andWhere('m.dimension = :dimension', { dimension })
      .andWhere('m.date BETWEEN :start AND :end', period)
      .getRawMany<{ key_text: string; clicks: number; impressions: number; position: number }>();
    return aggregateByKey(rows.map((r) => ({ key_text: r.key_text, clicks: Number(r.clicks), impressions: Number(r.impressions), position: Number(r.position) })));
  }

  private async persist(workspaceId: number, property: Property, findings: Finding[], cfg: RuleConfig) {
    const now = new Date();
    const counts = { created: 0, updated: 0, skipped: 0 };
    const fps = findings.map((f) => fingerprint(property.id, f));
    const existing = fps.length ? await this.repo.find({ where: { workspace_id: workspaceId, fingerprint: In(fps) } }) : [];
    const byFp = new Map(existing.map((o) => [o.fingerprint, o]));

    for (let i = 0; i < findings.length; i += 1) {
      const f = findings[i];
      const fp = fps[i];
      const current = byFp.get(fp);
      if (!current) {
        const opp = await this.repo.save(
          this.repo.create({
            workspace_id: workspaceId,
            property_id: property.id,
            rule: f.rule,
            subject: f.subject,
            key_text: f.key_text.slice(0, 2048),
            fingerprint: fp,
            status: 'open',
            priority: priorityFromScore(f.score),
            score: f.score,
            confidence: f.confidence,
            title: f.title.slice(0, 255),
            reason: f.reason,
            suggested_action: f.suggested_action,
            evidence: JSON.stringify(f.evidence),
            first_seen_at: now,
            last_seen_at: now,
          }),
        );
        await this.log(opp.id, null, 'created', { score: f.score, title: f.title });
        counts.created += 1;
        continue;
      }
      if (current.status === 'dismissed') {
        current.last_seen_at = now;
        await this.repo.save(current);
        counts.skipped += 1;
        continue;
      }
      if (current.status === 'done') {
        const since = current.completed_at ? (now.getTime() - current.completed_at.getTime()) / 86_400_000 : Infinity;
        if (since < cfg.regression_days) {
          counts.skipped += 1;
          continue;
        }
        // regression: reopen with fresh evidence, history kept
        current.status = 'open';
        current.completed_at = null;
        await this.log(current.id, null, 'status', { from: 'done', to: 'open', reason: `finding returned ${Math.round(since)} days after completion` });
      }
      current.last_seen_at = now;
      current.score = f.score;
      current.confidence = f.confidence;
      current.title = f.title.slice(0, 255);
      current.reason = f.reason;
      current.suggested_action = f.suggested_action;
      current.evidence = JSON.stringify(f.evidence);
      await this.repo.save(current);
      await this.log(current.id, null, 'evidence_updated', { score: f.score, title: f.title });
      counts.updated += 1;
    }
    return counts;
  }

  // ---- read ------------------------------------------------------------

  async list(filter: ListFilter) {
    const ws = await this.workspaces.current();
    const qb = this.repo.createQueryBuilder('o').where('o.workspace_id = :ws', { ws: ws.id });
    if (filter.status && filter.status !== 'all') {
      if (filter.status === 'active') qb.andWhere("o.status IN ('open','in_progress')");
      else qb.andWhere('o.status = :status', { status: filter.status });
    }
    if (filter.property_id) qb.andWhere('o.property_id = :pid', { pid: filter.property_id });
    if (filter.rule) qb.andWhere('o.rule = :rule', { rule: filter.rule });
    if (filter.priority) qb.andWhere('o.priority = :priority', { priority: filter.priority });
    if (filter.subject) qb.andWhere('o.subject = :subject', { subject: filter.subject });
    if (filter.assignee_id) qb.andWhere('o.assignee_id = :aid', { aid: filter.assignee_id });
    qb.orderBy("FIELD(o.status,'open','in_progress','done','dismissed')", 'ASC').addOrderBy('o.score', 'DESC').addOrderBy('o.last_seen_at', 'DESC');
    const items = await qb.getMany();
    const counts = await this.repo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .where('o.workspace_id = :ws', { ws: ws.id })
      .groupBy('o.status')
      .getRawMany<{ status: OpportunityStatus; n: string }>();
    return {
      items: items.map((o) => this.present(o)),
      counts: Object.fromEntries(OPPORTUNITY_STATUSES.map((s) => [s, Number(counts.find((c) => c.status === s)?.n ?? 0)])),
      scanning: this.scanning,
    };
  }

  async get(id: number) {
    const opp = await this.find(id);
    const events = await this.events.find({ where: { opportunity_id: id }, order: { created_at: 'ASC', id: 'ASC' } });
    return {
      ...this.present(opp),
      events: events.map((e) => ({ ...e, payload: e.payload ? safeParse(e.payload) : null })),
      impact: await this.impact(opp),
    };
  }

  /** Before/after around completion: the subject's metrics IMPACT_DAYS before vs after completed_at. */
  private async impact(opp: Opportunity) {
    if (!opp.completed_at) return null;
    const done = opp.completed_at.toISOString().slice(0, 10);
    const before: Period = { start: addDays(done, -IMPACT_DAYS), end: addDays(done, -1) };
    const after: Period = { start: addDays(done, 1), end: addDays(done, IMPACT_DAYS) };
    const through = defaultEndDate();
    const afterAvailable: Period = { start: after.start, end: after.end < through ? after.end : through };
    const daysAvailable = afterAvailable.end >= afterAvailable.start ? daysIn(afterAvailable) : 0;

    const totals = async (p: Period): Promise<MetricTotals> => {
      if (opp.subject === 'property') {
        const rows = await this.daily.createQueryBuilder('d').where('d.property_id = :id', { id: opp.property_id }).andWhere('d.date BETWEEN :start AND :end', p).getMany();
        return aggregate(rows);
      }
      const rows = await this.dims
        .createQueryBuilder('m')
        .where('m.property_id = :id', { id: opp.property_id })
        .andWhere('m.dimension = :dim', { dim: opp.subject })
        .andWhere('m.key_text = :key', { key: opp.key_text })
        .andWhere('m.date BETWEEN :start AND :end', p)
        .getMany();
      return aggregate(rows.map((r) => ({ date: r.date, clicks: r.clicks, impressions: r.impressions, position: r.position })));
    };
    return {
      completed_on: done,
      window_days: IMPACT_DAYS,
      before: { period: before, totals: await totals(before) },
      after: { period: afterAvailable, days_available: daysAvailable, totals: daysAvailable ? await totals(afterAvailable) : null },
      note: daysAvailable < IMPACT_DAYS ? `Only ${daysAvailable} of ${IMPACT_DAYS} days after completion have data yet (GSC lags ~3 days).` : null,
    };
  }

  // ---- write -----------------------------------------------------------

  async update(id: number, userId: number, input: UpdateInput) {
    const opp = await this.find(id);
    if (input.status !== undefined && input.status !== opp.status) {
      if (!OPPORTUNITY_STATUSES.includes(input.status)) throw new BadRequestException('Invalid status');
      await this.log(id, userId, 'status', { from: opp.status, to: input.status });
      opp.status = input.status;
      opp.completed_at = input.status === 'done' ? new Date() : input.status === 'open' || input.status === 'in_progress' ? null : opp.completed_at;
      opp.dismissed_at = input.status === 'dismissed' ? new Date() : null;
    }
    if (input.priority !== undefined && input.priority !== opp.priority) {
      if (!OPPORTUNITY_PRIORITIES.includes(input.priority)) throw new BadRequestException('Invalid priority');
      await this.log(id, userId, 'priority', { from: opp.priority, to: input.priority });
      opp.priority = input.priority;
    }
    if (input.assignee_id !== undefined && input.assignee_id !== opp.assignee_id) {
      await this.log(id, userId, 'assignee', { from: opp.assignee_id, to: input.assignee_id });
      opp.assignee_id = input.assignee_id;
    }
    if (input.due_date !== undefined && input.due_date !== opp.due_date) {
      if (input.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) throw new BadRequestException('due_date must be YYYY-MM-DD');
      await this.log(id, userId, 'due_date', { from: opp.due_date, to: input.due_date });
      opp.due_date = input.due_date;
    }
    if (input.note && input.note.trim()) {
      await this.log(id, userId, 'note', { text: input.note.trim().slice(0, 4000) });
    }
    await this.repo.save(opp);
    return this.get(id);
  }

  private async find(id: number): Promise<Opportunity> {
    const ws = await this.workspaces.current();
    const opp = await this.repo.findOne({ where: { id, workspace_id: ws.id } });
    if (!opp) throw new NotFoundException('Opportunity not found');
    return opp;
  }

  private async log(opportunityId: number, userId: number | null, type: OpportunityEventType, payload: Record<string, unknown>): Promise<void> {
    await this.events.save(this.events.create({ opportunity_id: opportunityId, user_id: userId, type, payload: JSON.stringify(payload) }));
  }

  private present(o: Opportunity) {
    return { ...o, evidence: safeParse(o.evidence) };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function daysIn(p: Period): number {
  const a = new Date(`${p.start}T00:00:00Z`).getTime();
  const b = new Date(`${p.end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}
