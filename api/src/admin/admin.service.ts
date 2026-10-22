import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '../integrations/mailer.service';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';

/**
 * Cross-tenant reads and account actions for /x-dashboard (MISS-0124). Every caller is behind
 * SuperAdminGuard. Responses never carry password hashes, tokens or SMTP credentials.
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(Property)
    private readonly properties: Repository<Property>,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async overview() {
    const [users, active, pending, workspaces, properties] = await Promise.all([
      this.users.count({ where: { approval_status: 'approved' } }),
      this.users.count({
        where: { approval_status: 'approved', is_active: true },
      }),
      this.users.count({ where: { approval_status: 'pending' } }),
      this.workspaces.count(),
      this.properties.count(),
    ]);
    return { users, active, pending, workspaces, properties };
  }

  /** Every account that went past email confirmation, with its workspace. */
  async accounts() {
    const rows = await this.users
      .createQueryBuilder('u')
      .leftJoin(WorkspaceMember, 'm', 'm.user_id = u.id')
      .leftJoin(Workspace, 'w', 'w.id = m.workspace_id')
      .where('u.approval_status <> :unverified', { unverified: 'unverified' })
      .select([
        'u.id AS id',
        'u.email AS email',
        'u.name AS name',
        'u.company AS company',
        'u.role AS role',
        'u.is_active AS is_active',
        'u.approval_status AS approval_status',
        'u.created_at AS created_at',
        'w.id AS workspace_id',
        'w.slug AS workspace_slug',
        'w.name AS workspace_name',
      ])
      .orderBy('u.created_at', 'DESC')
      .getRawMany<Record<string, unknown>>();
    return rows.map((r) => ({
      ...r,
      is_active: Boolean(Number(r.is_active)),
    }));
  }

  async workspaceList() {
    const rows = await this.workspaces
      .createQueryBuilder('w')
      .select([
        'w.id AS id',
        'w.slug AS slug',
        'w.name AS name',
        'w.created_at AS created_at',
      ])
      .addSelect(
        (q) =>
          q
            .select('COUNT(*)')
            .from(WorkspaceMember, 'm')
            .where('m.workspace_id = w.id'),
        'members',
      )
      .addSelect(
        (q) =>
          q
            .select('COUNT(*)')
            .from(Property, 'p')
            .where('p.workspace_id = w.id'),
        'properties',
      )
      .orderBy('w.id', 'ASC')
      .getRawMany<Record<string, unknown>>();
    return rows.map((r) => ({
      ...r,
      members: Number(r.members),
      properties: Number(r.properties),
    }));
  }

  /** Deactivating signs the account out everywhere (token_version bump). */
  async setActive(id: number, active: boolean, actingUserId: number) {
    if (id === actingUserId && !active) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.users.findOne({ where: { id } });
    if (!user || user.approval_status !== 'approved') {
      throw new NotFoundException('Account not found');
    }
    if (user.is_active === active) return;
    user.is_active = active;
    if (!active) user.token_version += 1;
    await this.users.save(user);
  }

  /** What the mailer uses, minus the secrets: no user name, no password. */
  smtp() {
    const get = (k: string) => this.config.get<string>(k) ?? '';
    return {
      configured: this.mailer.isConfigured(),
      host: get('SMTP_HOST') || null,
      port: Number.parseInt(get('SMTP_PORT') || '587', 10),
      secure: get('SMTP_SECURE') === 'true',
      starttls: (get('SMTP_STARTTLS') || 'true') === 'true',
      authenticated: Boolean(get('SMTP_USER')),
      from: get('MAIL_FROM') || null,
      from_name: get('MAIL_FROM_NAME') || 'Spider',
    };
  }

  /** Sends a test mail to the signed-in super admin only (no free recipient: not a relay). */
  async smtpTest(userId: number) {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (!this.mailer.isConfigured()) {
      return { sent: false, to: user.email, error: 'SMTP is not configured' };
    }
    try {
      const r = await this.mailer.send({
        to: [user.email],
        subject: 'Spider SMTP test',
        text: `This test was sent from the Spider super-admin dashboard at ${new Date().toISOString()}.`,
      });
      return { sent: !r.skipped, to: user.email };
    } catch (err) {
      // the transport error names the server, never the credentials
      const msg = err instanceof Error ? err.message : String(err);
      return { sent: false, to: user.email, error: msg.slice(0, 200) };
    }
  }
}
