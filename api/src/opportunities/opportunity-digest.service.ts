import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { MailerService } from '../integrations/mailer.service';
import { User } from '../users/entities/user.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  DIGEST_STATUSES,
  DigestContent,
  DigestOpportunity,
  digestWeekKey,
  digestWindow,
  renderDigest,
  selectNew,
} from './digest';
import { OpportunityDigestDelivery } from './entities/opportunity-digest-delivery.entity';
import { Opportunity } from './entities/opportunity.entity';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DigestOutcome = 'sent' | 'skipped' | 'failed' | 'duplicate';

export interface DigestRunResult {
  workspaces: number;
  empty: number;
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicate: number;
}

/**
 * Monday digest of the opportunities first seen in the previous 7 days (MISS-0196). Every
 * workspace is handled inside its own `runAs()` scope and only reads its own rows; recipients
 * are the workspace's active, approved admins who did not opt out.
 */
@Injectable()
export class OpportunityDigestService {
  private readonly logger = new Logger(OpportunityDigestService.name);
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunities: Repository<Opportunity>,
    @InjectRepository(OpportunityDigestDelivery)
    private readonly deliveries: Repository<OpportunityDigestDelivery>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    private readonly workspaces: WorkspacesService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.publicUrl = (config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }

  /** Cron entry point: every workspace, one at a time; one failing tenant never stops the rest. */
  async runWeekly(now = new Date()): Promise<DigestRunResult> {
    const total: DigestRunResult = {
      workspaces: 0,
      empty: 0,
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      duplicate: 0,
    };
    for (const ws of await this.workspaces.all()) {
      total.workspaces += 1;
      try {
        const r = await this.workspaces.runAs(ws.id, () =>
          this.runWorkspace(now),
        );
        if (r.empty) total.empty += 1;
        total.recipients += r.recipients;
        for (const k of ['sent', 'skipped', 'failed', 'duplicate'] as const)
          total[k] += r[k];
      } catch (err) {
        this.logger.warn(
          `weekly digest (workspace ${ws.slug}): ${(err as Error).message}`,
        );
      }
    }
    return total;
  }

  /** The current workspace's digest (must run inside a request or `runAs()` scope). */
  async runWorkspace(now = new Date()): Promise<{
    empty: boolean;
    recipients: number;
    sent: number;
    skipped: number;
    failed: number;
    duplicate: number;
  }> {
    const result = {
      empty: false,
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      duplicate: 0,
    };
    const digest = await this.build(now);
    // an empty week sends nothing and claims nothing
    if (!digest.count) return { ...result, empty: true };
    const wsId = this.workspaces.currentId();
    const weekKey = digestWeekKey(now);
    const recipients = await this.recipients(wsId);
    result.recipients = recipients.length;
    for (const user of recipients) {
      result[await this.deliver(wsId, user, weekKey, digest, now)] += 1;
    }
    return result;
  }

  /** What this week's mail would say for the current workspace, without sending or claiming. */
  async preview(now = new Date()) {
    const digest = await this.build(now);
    const recipients = await this.recipients(this.workspaces.currentId());
    return {
      week_key: digestWeekKey(now),
      opportunity_count: digest.count,
      listed: digest.listed,
      would_send: digest.count > 0,
      recipients: recipients.map((u) => u.email),
      subject: digest.subject,
      text: digest.text,
    };
  }

  private async build(now: Date): Promise<DigestContent> {
    const ws = await this.workspaces.current();
    const window = digestWindow(now);
    const rows = await this.opportunities.find({
      where: {
        workspace_id: ws.id,
        status: In(DIGEST_STATUSES),
        first_seen_at: Between(window.since, window.until),
      },
      relations: { property: true },
    });
    const items = selectNew(
      rows.map((o): DigestOpportunity => ({
        id: o.id,
        workspace_id: o.workspace_id,
        property_id: o.property_id,
        property_name: o.property?.display_name ?? `Property ${o.property_id}`,
        title: o.title,
        priority: o.priority,
        score: o.score,
        status: o.status,
        reason: o.reason,
        first_seen_at: new Date(o.first_seen_at),
      })),
      ws.id,
      window,
    );
    const stillOpen = await this.opportunities.count({
      where: { workspace_id: ws.id, status: In(DIGEST_STATUSES) },
    });
    return renderDigest({
      workspaceName: ws.name,
      window,
      items,
      stillOpen,
      publicUrl: this.publicUrl,
    });
  }

  /** Active, approved admins of the workspace with a usable email who keep the digest on. */
  async recipients(workspaceId: number): Promise<User[]> {
    const rows = await this.members.find({
      where: { workspace_id: workspaceId },
      relations: { user: true },
      order: { id: 'ASC' },
    });
    return rows
      .filter((m) => m.workspace_id === workspaceId)
      .map((m) => m.user)
      .filter(
        (u): u is User =>
          Boolean(u) &&
          u.role === 'admin' &&
          u.is_active &&
          u.approval_status === 'approved' &&
          u.weekly_opportunities_email !== false &&
          EMAIL.test(u.email ?? ''),
      );
  }

  /** Claim (recipient, workspace, week) first; a duplicate key means someone already did. */
  private async deliver(
    workspaceId: number,
    user: User,
    weekKey: string,
    digest: DigestContent,
    now: Date,
  ): Promise<DigestOutcome> {
    let row: OpportunityDigestDelivery;
    try {
      row = await this.deliveries.save(
        this.deliveries.create({
          workspace_id: workspaceId,
          user_id: user.id,
          week_key: weekKey,
          status: 'skipped',
          opportunity_count: digest.count,
          error: null,
          sent_at: null,
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY')
        return 'duplicate';
      throw err;
    }
    try {
      const res = await this.mailer.send({
        to: [user.email],
        subject: digest.subject,
        text: digest.text,
      });
      row.status = res.skipped ? 'skipped' : 'sent';
      row.error = res.skipped ? 'SMTP not configured' : null;
      row.sent_at = res.skipped ? null : now;
    } catch (err) {
      row.status = 'failed';
      row.error = (err as Error).message.slice(0, 2000);
      this.logger.error(
        `weekly digest to user ${user.id} (workspace ${workspaceId}) failed: ${row.error}`,
      );
    }
    await this.deliveries.save(row);
    return row.status;
  }
}
