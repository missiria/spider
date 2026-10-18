import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { MailerService } from '../integrations/mailer.service';
import { User } from '../users/entities/user.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import {
  DEFAULT_WORKSPACE_SLUG,
  WorkspacesService,
} from '../workspaces/workspaces.service';
import { PasswordReset } from './entities/password-reset.entity';

export const RESET_TTL_MS = 30 * 60_000;
/** reset mails per account per hour; further requests are silently dropped */
export const RESET_PER_HOUR = 3;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Self-service accounts (MISS-0116).
 *
 * Signups land `pending`: Spider reads Search Console through one shared service account, so an
 * unknown account must never get a workspace (and the ability to add properties) on its own.
 * An operator — an admin of the default workspace — approves, which creates the user's own
 * workspace with them as its admin.
 *
 * Register and forgot-password answer the same way whether or not the email exists, and do
 * the same bcrypt work, so neither can be used to enumerate accounts. Mails are sent in the
 * background so SMTP latency does not show in response times either.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger('Signup');
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordReset)
    private readonly resets: Repository<PasswordReset>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    private readonly workspaces: WorkspacesService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.publicUrl = (config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/+$/,
      '',
    );
  }

  // ---- register ----------------------------------------------------------

  async register(input: {
    name: string;
    email: string;
    password: string;
    company?: string;
  }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const hash = await bcrypt.hash(input.password, 10);
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      // same answer as a fresh signup; the owner of the address can use "forgot password"
      this.logger.log(`register: existing email user=${existing.id}`);
      return;
    }
    const user = await this.users.save(
      this.users.create({
        email,
        name: input.name.trim(),
        company: input.company?.trim() || null,
        password_hash: hash,
        role: 'member',
        is_active: true,
        approval_status: 'pending',
      }),
    );
    this.logger.log(`register: pending user=${user.id}`);
    this.background(this.notifyOperators(user));
  }

  // ---- approval (operator only) -----------------------------------------

  async listPending() {
    await this.assertOperator();
    const rows = await this.users.find({
      where: { approval_status: 'pending' },
      order: { created_at: 'ASC' },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      company: u.company,
      created_at: u.created_at,
    }));
  }

  /** Creates the user's own workspace (user = its admin) and lets them sign in. */
  async approve(
    id: number,
  ): Promise<{ workspace: { id: number; slug: string } }> {
    await this.assertOperator();
    const user = await this.pendingUser(id);
    const name = user.company || `${user.name}'s workspace`;
    const ws = await this.workspaceRepo.save(
      this.workspaceRepo.create({ slug: await this.freeSlug(name), name }),
    );
    await this.members.save(
      this.members.create({ workspace_id: ws.id, user_id: user.id }),
    );
    user.approval_status = 'approved';
    user.role = 'admin';
    await this.users.save(user);
    this.logger.log(`approve: user=${user.id} workspace=${ws.id}`);
    this.background(
      this.mailer.send({
        to: [user.email],
        subject: 'Your Spider account is ready',
        text: [
          `Hi ${user.name},`,
          '',
          'Your Spider account has been approved. Sign in with the email and password you chose:',
          `${this.publicUrl}/login`,
        ].join('\n'),
      }),
    );
    return { workspace: { id: ws.id, slug: ws.slug } };
  }

  async reject(id: number): Promise<void> {
    await this.assertOperator();
    const user = await this.pendingUser(id);
    user.approval_status = 'rejected';
    user.is_active = false;
    await this.users.save(user);
    this.logger.log(`reject: user=${user.id}`);
  }

  // ---- password reset ----------------------------------------------------

  async requestPasswordReset(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.is_active || user.approval_status !== 'approved') {
      return;
    }
    const recent = await this.resets.count({
      where: {
        user_id: user.id,
        created_at: MoreThan(new Date(Date.now() - 60 * 60_000)),
      },
    });
    if (recent >= RESET_PER_HOUR) {
      this.logger.warn(`forgot: hourly cap reached user=${user.id}`);
      return;
    }
    const token = randomBytes(32).toString('base64url');
    await this.resets.save(
      this.resets.create({
        user_id: user.id,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + RESET_TTL_MS),
        used_at: null,
      }),
    );
    const link = `${this.publicUrl}/reset-password?token=${token}`;
    this.background(
      this.mailer.send({
        to: [user.email],
        subject: 'Reset your Spider password',
        text: [
          `Hi ${user.name},`,
          '',
          'Someone asked to reset the password of your Spider account. Open this link to choose a new one (valid 30 minutes, single use):',
          link,
          '',
          'If it was not you, ignore this email: your password stays the same.',
        ].join('\n'),
      }),
    );
  }

  /** Returns the account email so the caller can clear its login lock. */
  async resetPassword(token: string, password: string): Promise<string> {
    const row = await this.resets.findOne({
      where: {
        token_hash: sha256(token),
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    const user = row
      ? await this.users.findOne({ where: { id: row.user_id } })
      : null;
    if (
      !row ||
      !user ||
      !user.is_active ||
      user.approval_status !== 'approved'
    ) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Ask for a new one.',
      );
    }
    user.password_hash = await bcrypt.hash(password, 10);
    // signs the account out everywhere: a reset usually means the old password leaked
    user.token_version += 1;
    await this.users.save(user);
    // every outstanding link of this account dies with the one just used
    await this.resets.update(
      { user_id: user.id, used_at: IsNull() },
      { used_at: new Date() },
    );
    this.logger.log(`reset: password changed user=${user.id}`);
    return user.email;
  }

  // ---- helpers -----------------------------------------------------------

  /** Approvals are an operator decision: admins of the default workspace only. */
  private async assertOperator(): Promise<void> {
    const ws = await this.workspaces.current();
    if (ws.slug !== DEFAULT_WORKSPACE_SLUG) {
      throw new ForbiddenException('Only operators can review signups');
    }
  }

  private async pendingUser(id: number): Promise<User> {
    const user = await this.users.findOne({
      where: { id, approval_status: 'pending' },
    });
    if (!user) throw new NotFoundException('Pending signup not found');
    return user;
  }

  private async freeSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'workspace';
    for (let i = 0; i < 5; i++) {
      const slug = i === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      if (!(await this.workspaceRepo.count({ where: { slug } }))) return slug;
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  private async notifyOperators(user: User): Promise<void> {
    const ws = await this.workspaceRepo.findOne({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
    });
    if (!ws) return;
    const ids = (
      await this.members.find({ where: { workspace_id: ws.id } })
    ).map((m) => m.user_id);
    if (!ids.length) return;
    const admins = await this.users.find({
      where: { id: In(ids), role: 'admin', is_active: true },
    });
    if (!admins.length) return;
    await this.mailer.send({
      to: admins.map((a) => a.email),
      subject: `New Spider signup: ${user.name}`,
      text: [
        `${user.name} <${user.email}>${user.company ? ` (${user.company})` : ''} asked for a Spider account.`,
        '',
        `Review it in System → Signups: ${this.publicUrl}/system`,
      ].join('\n'),
    });
  }

  /** Fire-and-forget with a catch: an unhandled rejection would kill the process (Node 24). */
  private background(p: Promise<unknown>): void {
    p.catch((err: unknown) =>
      this.logger.error(
        `mail failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
