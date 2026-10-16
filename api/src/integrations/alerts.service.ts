import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Property } from '../properties/entities/property.entity';
import { parseRecipients } from '../reports/report.util';
import { SyncRun } from '../sync/entities/sync-run.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AlertEvent } from './entities/alert-event.entity';
import { AlertConfig, AlertRule } from './entities/alert-rule.entity';
import { MailerService } from './mailer.service';
import { WebhooksService } from './webhooks.service';

const LOOKBACK_HOURS = 48;

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  opportunity_priorities: ['high'],
  opportunity_rules: [],
  property_ids: [],
  sync_failed: true,
  property_revoked: true,
};

interface Candidate {
  dedupeKey: string;
  kind: 'opportunity' | 'sync_failed' | 'property_revoked';
  title: string;
  propertyId: number;
  payload: Record<string, unknown>;
  priority?: string;
  rule?: string;
}

/**
 * Pull-based: every hour (and after a scan) look at what happened in the last 48 h and alert
 * on anything not alerted yet. Dedupe = (rule, subject) unique row in alert_events.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(AlertRule) private readonly rules: Repository<AlertRule>,
    @InjectRepository(AlertEvent)
    private readonly events: Repository<AlertEvent>,
    @InjectRepository(Opportunity)
    private readonly opportunities: Repository<Opportunity>,
    @InjectRepository(SyncRun) private readonly runs: Repository<SyncRun>,
    @InjectRepository(Property)
    private readonly properties: Repository<Property>,
    private readonly workspaces: WorkspacesService,
    private readonly mailer: MailerService,
    private readonly webhooks: WebhooksService,
    config: ConfigService,
  ) {
    this.publicUrl = (config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }

  present(r: AlertRule) {
    return {
      ...r,
      config: mergeAlertConfig(safeParse(r.config, {})),
      target:
        r.channel === 'email'
          ? safeParse<string[]>(r.target, [])
          : Number(r.target),
    };
  }

  async list() {
    const ws = await this.workspaces.current();
    const items = await this.rules.find({
      where: { workspace_id: ws.id },
      order: { name: 'ASC' },
    });
    const recent = await this.events.find({
      where: { workspace_id: ws.id },
      order: { created_at: 'DESC' },
      take: 50,
    });
    return {
      items: items.map((r) => this.present(r)),
      recent: recent.map((e) => ({ ...e, payload: safeParse(e.payload, {}) })),
      mail_configured: this.mailer.isConfigured(),
    };
  }

  async create(input: {
    name: string;
    channel: 'email' | 'webhook';
    target: unknown;
    config?: unknown;
  }) {
    const ws = await this.workspaces.current();
    const r = await this.rules.save(
      this.rules.create({
        workspace_id: ws.id,
        name: input.name.trim(),
        channel: input.channel,
        target: await this.encodeTarget(input.channel, input.target),
        config: JSON.stringify(mergeAlertConfig(input.config)),
        enabled: true,
      }),
    );
    return this.present(r);
  }

  async update(
    id: number,
    input: {
      name?: string;
      channel?: 'email' | 'webhook';
      target?: unknown;
      config?: unknown;
      enabled?: boolean;
    },
  ) {
    const r = await this.find(id);
    if (input.name !== undefined) r.name = input.name.trim();
    if (input.channel !== undefined) r.channel = input.channel;
    if (input.target !== undefined)
      r.target = await this.encodeTarget(r.channel, input.target);
    if (input.config !== undefined)
      r.config = JSON.stringify(mergeAlertConfig(input.config));
    if (input.enabled !== undefined) r.enabled = input.enabled;
    return this.present(await this.rules.save(r));
  }

  async remove(id: number): Promise<void> {
    await this.rules.remove(await this.find(id));
  }

  /** Evaluate every enabled rule; returns how many alerts were delivered. */
  async evaluate(): Promise<{
    rules: number;
    sent: number;
    skipped: number;
    failed: number;
  }> {
    const ws = await this.workspaces.current();
    const rules = await this.rules.find({
      where: { workspace_id: ws.id, enabled: true },
    });
    const result = { rules: rules.length, sent: 0, skipped: 0, failed: 0 };
    if (!rules.length) return result;
    const candidates = await this.collectCandidates();
    for (const rule of rules) {
      const cfg = mergeAlertConfig(safeParse(rule.config, {}));
      for (const c of candidates) {
        if (!matches(cfg, c)) continue;
        const outcome = await this.deliver(rule, c);
        if (outcome === 'sent') result.sent += 1;
        else if (outcome === 'skipped') result.skipped += 1;
        else if (outcome === 'failed') result.failed += 1;
      }
    }
    return result;
  }

  private async collectCandidates(): Promise<Candidate[]> {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000);
    const workspaceId = this.workspaces.currentId();
    const props = await this.properties.find({
      where: { workspace_id: workspaceId },
    });
    const propertyIds = props.map((p) => p.id);
    const name = new Map(props.map((p) => [p.id, p.display_name]));
    const out: Candidate[] = [];
    const opps = await this.opportunities.find({
      where: {
        workspace_id: workspaceId,
        first_seen_at: MoreThanOrEqual(since),
        status: 'open',
      },
    });
    for (const o of opps) {
      out.push({
        dedupeKey: `opportunity:${o.id}`,
        kind: 'opportunity',
        title: `[${o.priority}] ${o.title} — ${name.get(o.property_id) ?? o.property_id}`,
        propertyId: o.property_id,
        priority: o.priority,
        rule: o.rule,
        payload: {
          opportunity_id: o.id,
          rule: o.rule,
          subject: o.subject,
          key: o.key_text,
          priority: o.priority,
          score: o.score,
          confidence: o.confidence,
          title: o.title,
          property_id: o.property_id,
          property: name.get(o.property_id),
          url: `${this.publicUrl}/opportunities/${o.id}`,
        },
      });
    }
    const failed = propertyIds.length
      ? await this.runs.find({
          where: {
            property_id: In(propertyIds),
            status: In(['failed', 'partial']),
            started_at: MoreThanOrEqual(since),
          },
        })
      : [];
    for (const r of failed) {
      out.push({
        dedupeKey: `sync_run:${r.id}`,
        kind: 'sync_failed',
        title: `${r.status === 'partial' ? 'Sync incomplete' : 'Sync failed'}: ${name.get(r.property_id) ?? r.property_id} (${r.kind})`,
        propertyId: r.property_id,
        payload: {
          sync_run_id: r.id,
          property_id: r.property_id,
          property: name.get(r.property_id),
          kind: r.kind,
          error: r.error,
          started_at: r.started_at,
          url: `${this.publicUrl}/properties/${r.property_id}`,
        },
      });
    }
    for (const p of props.filter((x) => x.status === 'revoked')) {
      out.push({
        dedupeKey: `property:${p.id}:revoked:${(p.last_checked_at ?? new Date()).toISOString().slice(0, 10)}`,
        kind: 'property_revoked',
        title: `Access revoked: ${p.display_name}`,
        propertyId: p.id,
        payload: {
          property_id: p.id,
          property: p.display_name,
          site_url: p.site_url,
          last_checked_at: p.last_checked_at,
          url: `${this.publicUrl}/properties/${p.id}`,
        },
      });
    }
    return out;
  }

  private async deliver(
    rule: AlertRule,
    c: Candidate,
  ): Promise<'sent' | 'skipped' | 'failed' | 'duplicate'> {
    const ws = await this.workspaces.current();
    // reserve the (rule, subject) slot first; a duplicate key means it was already handled
    let event: AlertEvent;
    try {
      event = await this.events.save(
        this.events.create({
          workspace_id: ws.id,
          rule_id: rule.id,
          dedupe_key: c.dedupeKey,
          kind: c.kind,
          title: c.title.slice(0, 255),
          payload: JSON.stringify(c.payload),
          status: 'skipped',
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY')
        return 'duplicate';
      throw err;
    }
    try {
      if (rule.channel === 'email') {
        const to = safeParse<string[]>(rule.target, []);
        const res = await this.mailer.send({
          to,
          subject: `Spider alert · ${c.title}`.slice(0, 200),
          text: `${c.title}\n\n${Object.entries(c.payload)
            .map(([k, v]) => `${k}: ${v ?? ''}`)
            .join('\n')}\n\nRule: ${rule.name}`,
        });
        event.status = res.skipped ? 'skipped' : 'sent';
        event.error = res.skipped ? 'SMTP not configured' : null;
      } else {
        const queued = await this.webhooks.emit(
          'alert.triggered',
          `alert:${rule.id}:${c.dedupeKey}`,
          { rule: rule.name, kind: c.kind, title: c.title, ...c.payload },
        );
        event.status = queued ? 'sent' : 'skipped';
        event.error = queued
          ? null
          : 'Webhook not subscribed to alert.triggered or disabled';
      }
    } catch (err) {
      event.status = 'failed';
      event.error = (err as Error).message.slice(0, 1000);
      this.logger.warn(`alert ${rule.id} ${c.dedupeKey}: ${event.error}`);
    }
    await this.events.save(event);
    if (event.status === 'sent') {
      rule.last_fired_at = new Date();
      await this.rules.save(rule);
    }
    return event.status;
  }

  private async encodeTarget(
    channel: 'email' | 'webhook',
    target: unknown,
  ): Promise<string> {
    if (channel === 'email') {
      const list = parseRecipients(target);
      if (!list.length)
        throw new BadRequestException(
          'At least one valid recipient email is required',
        );
      return JSON.stringify(list);
    }
    const id = Number(target);
    if (!Number.isInteger(id))
      throw new BadRequestException('Webhook id required');
    await this.webhooks.find(id); // scoped existence check
    return String(id);
  }

  private async find(id: number): Promise<AlertRule> {
    const ws = await this.workspaces.current();
    const r = await this.rules.findOne({ where: { id, workspace_id: ws.id } });
    if (!r) throw new NotFoundException('Alert rule not found');
    return r;
  }
}

export function mergeAlertConfig(raw: unknown): AlertConfig {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof AlertConfig, unknown>
  >;
  const prios = Array.isArray(p.opportunity_priorities)
    ? p.opportunity_priorities.filter(
        (x): x is 'high' | 'medium' | 'low' =>
          x === 'high' || x === 'medium' || x === 'low',
      )
    : DEFAULT_ALERT_CONFIG.opportunity_priorities;
  return {
    opportunity_priorities: prios,
    opportunity_rules: Array.isArray(p.opportunity_rules)
      ? p.opportunity_rules.map(String).slice(0, 10)
      : [],
    property_ids: Array.isArray(p.property_ids)
      ? p.property_ids.map(Number).filter(Number.isInteger).slice(0, 200)
      : [],
    sync_failed:
      typeof p.sync_failed === 'boolean'
        ? p.sync_failed
        : DEFAULT_ALERT_CONFIG.sync_failed,
    property_revoked:
      typeof p.property_revoked === 'boolean'
        ? p.property_revoked
        : DEFAULT_ALERT_CONFIG.property_revoked,
  };
}

export function matches(cfg: AlertConfig, c: Candidate): boolean {
  if (cfg.property_ids.length && !cfg.property_ids.includes(c.propertyId))
    return false;
  if (c.kind === 'sync_failed') return cfg.sync_failed;
  if (c.kind === 'property_revoked') return cfg.property_revoked;
  if (!cfg.opportunity_priorities.includes(c.priority as 'high')) return false;
  if (
    cfg.opportunity_rules.length &&
    !cfg.opportunity_rules.includes(c.rule ?? '')
  )
    return false;
  return true;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
