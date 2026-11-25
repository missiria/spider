import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '../integrations/mailer.service';
import { User } from '../users/entities/user.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { renderDoneNotification } from './done-notification';
import { Opportunity } from './entities/opportunity.entity';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DoneNotifyResult {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * MISS-0198: when an opportunity moves to "done", every active, approved member of its
 * workspace gets one email (one message per recipient, so addresses are never shared).
 * Tenant-scoped: recipients come only from the opportunity's own workspace.
 */
@Injectable()
export class DoneNotificationService {
  private readonly logger = new Logger(DoneNotificationService.name);
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly workspaces: WorkspacesService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.publicUrl = (config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }

  /** Active, approved members of the workspace with a usable email (any role). */
  async recipients(workspaceId: number): Promise<User[]> {
    const rows = await this.members.find({
      where: { workspace_id: workspaceId },
      relations: { user: true },
      order: { id: 'ASC' },
    });
    const seen = new Set<string>();
    return rows
      .filter((m) => m.workspace_id === workspaceId)
      .map((m) => m.user)
      .filter((u): u is User => {
        if (!u || !u.is_active || u.approval_status !== 'approved')
          return false;
        const email = (u.email ?? '').trim().toLowerCase();
        if (!EMAIL.test(email) || seen.has(email)) return false;
        seen.add(email);
        return true;
      });
  }

  /**
   * Fire-and-forget entry used by OpportunitiesService.update(): never throws, never delays
   * the PATCH response. Errors are logged.
   */
  dispatch(opp: Opportunity, actorId: number, note?: string | null): void {
    const workspaceId = opp.workspace_id;
    void this.workspaces
      .runAs(workspaceId, () => this.notify(opp, actorId, note))
      .then((r) =>
        this.logger.log(
          `opportunity ${opp.id} done: ${r.sent}/${r.recipients} sent, ${r.skipped} skipped, ${r.failed} failed`,
        ),
      )
      .catch((err: Error) =>
        this.logger.error(
          `opportunity ${opp.id} done notification failed: ${err.message}`,
        ),
      );
  }

  async notify(
    opp: Opportunity,
    actorId: number,
    note?: string | null,
  ): Promise<DoneNotifyResult> {
    const result: DoneNotifyResult = {
      recipients: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
    const [ws, actor, recipients] = await Promise.all([
      this.workspaces.get(opp.workspace_id),
      this.users.findOne({ where: { id: actorId } }),
      this.recipients(opp.workspace_id),
    ]);
    result.recipients = recipients.length;
    if (!recipients.length) return result;
    const { subject, text } = renderDoneNotification({
      id: opp.id,
      title: opp.title,
      property_name:
        opp.property?.display_name ?? `Property ${opp.property_id}`,
      rule: opp.rule,
      priority: opp.priority,
      key_text: opp.key_text,
      actor_name: actor?.name || actor?.email || '',
      workspace_name: ws.name,
      completed_at: opp.completed_at ?? new Date(),
      note,
      publicUrl: this.publicUrl,
    });
    for (const user of recipients) {
      try {
        const res = await this.mailer.send({ to: [user.email], subject, text });
        result[res.skipped ? 'skipped' : 'sent'] += 1;
      } catch (err) {
        result.failed += 1;
        this.logger.warn(
          `done notification for opportunity ${opp.id} to user ${user.id}: ${(err as Error).message}`,
        );
      }
    }
    return result;
  }
}
