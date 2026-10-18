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
import { PasswordReset, TokenPurpose } from './entities/password-reset.entity';

export const RESET_TTL_MS = 30 * 60_000;
export const VERIFY_TTL_MS = 24 * 60 * 60_000;
/** mails of one kind (reset or confirmation) per account per hour; more are silently dropped */
export const MAILS_PER_HOUR = 3;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Self-service accounts (MISS-0116).
 *
 * Signups land `unverified`: the emailed confirmation link proves the address before an operator
 * ever sees the request (otherwise anyone could pre-claim someone else's email with their own
 * password and have it approved). Re-registering an unverified address replaces that record, so
 * the real owner always wins. Confirmed signups are `pending`: Spider reads Search Console
 * through one shared service account, so an unknown account must never get a workspace (and
 * the ability to add properties) on its own. An operator — an admin of the default workspace —
 * approves, which creates the user's own workspace with them as its admin.
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

  // ---- register --------------------------------------------------------

  async register(input: {
    name: string;
    email: string;
    password: string;
    company?: string;
  }): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const hash = await bcrypt.hash(input.password, 10);
    const existing = await this.users.findOne({ where: { email } });
    if (existing && existing.approval_status !== 'unverified') {
      // same answer as a fresh signup; the owner of the address can use "forgot password"
      this.logger.log(`register: existing email user=${existing.id}`);
      return;
    }
    let user: User;
    if (existing) {
      // nobody proved this address yet: the newest request replaces the old one, and links
      // sent for the old one stop working (token_version bump)
      existing.name = input.name.trim();
      existing.company = input.company?.trim() || null;
      existing.password_hash = hash;
      existing.token_version += 1;
      user = await this.users.save(existing);
      await this.retireTokens(user.id);
    } else {
      user = await this.users.save(
        this.users.create({
          email,
          name: input.name.trim(),
          company: input.company?.trim() || null,
          password_hash: hash,
          role: 'member',
          is_active: true,
          approval_status: 'unverified',
        }),
      );
    }
    this.logger.log(`register: unverified user=${user.id}`);
    const token = await this.issueToken(user, 'verify', VERIFY_TTL_MS);
    if (!token) return;
    this.background(
      this.mailer.send({
        to: [user.email],
        subject: 'Confirm your email for Spider',
        text: [
          `Hi ${user.name},`,
          '',
          'Confirm this address to finish your Spider account request (link valid 24 hours):',
          `${this.publicUrl}/verify-email?token=${token}`,
          '',
          'An admin reviews every new account after that; we will email you once yours is approved.',
          'If you did not ask for a Spider account, ignore this email.',
        ].join('\n'),
      }),
    );
  }

  /** Confirms the signup address: the request becomes visible to operators. */
  async verifyEmail(token: string): Promise<void> {
    const found = await this.consumable(token, 'verify');
    if (!found || found.user.approval_status !== 'unverified') {
      throw new BadRequestException(
        'This confirmation link is invalid or has expired. Sign up again to get a new one.',
      );
    }
    const { user } = found;
    user.approval_status = 'pending';
    await this.users.save(user);
    await this.retireTokens(user.id, 'verify');
    this.logger.log(`verify: pending user=${user.id}`);
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
    const token = await this.issueToken(user, 'reset', RESET_TTL_MS);
    if (!token) return;
    this.background(
      this.mailer.send({
        to: [user.email],
        subject: 'Reset your Spider password',
        text: [
          `Hi ${user.name},`,
          '',
          'Someone asked to reset the password of your Spider account. Open this link to choose a new one (valid 30 minutes, single use):',
          `${this.publicUrl}/reset-password?token=${token}`,
          '',
          'If it was not you, ignore this email: your password stays the same.',
        ].join('\n'),
      }),
    );
  }

  /** Returns the account email so the caller can clear its login lock. */
  async resetPassword(token: string, password: string): Promise<string> {
    const found = await this.consumable(token, 'reset');
    if (!found || found.user.approval_status !== 'approved') {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Ask for a new one.',
      );
    }
    const { user } = found;
    user.password_hash = await bcrypt.hash(password, 10);
    // signs the account out everywhere: a reset usually means the old password leaked
    user.token_version += 1;
    await this.users.save(user);
    // every outstanding link of this account dies with the one just used
    await this.retireTokens(user.id);
    this.logger.log(`reset: password changed user=${user.id}`);
    return user.email;
  }

  // ---- tokens ------------------------------------------------------------

  /** New single-use link for `user`, or null past the hourly cap. Returns the raw token. */
  private async issueToken(
    user: User,
    purpose: TokenPurpose,
    ttlMs: number,
  ): Promise<string | null> {
    const recent = await this.resets.count({
      where: {
        user_id: user.id,
        purpose,
        created_at: MoreThan(new Date(Date.now() - 60 * 60_000)),
      },
    });
    if (recent >= MAILS_PER_HOUR) {
      this.logger.warn(`${purpose}: hourly cap reached user=${user.id}`);
      return null;
    }
    const token = randomBytes(32).toString('base64url');
    await this.resets.save(
      this.resets.create({
        user_id: user.id,
        purpose,
        email: user.email,
        token_version: user.token_version,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + ttlMs),
        used_at: null,
      }),
    );
    return token;
  }

  /**
   * The live row for `token` and its user, or null. A link only works for the address and
   * token_version it was issued for: an email change, a password reset, a session revocation
   * or a deactivation in between kills it.
   */
  private async consumable(
    token: string,
    purpose: TokenPurpose,
  ): Promise<{ row: PasswordReset; user: User } | null> {
    const row = await this.resets.findOne({
      where: {
        token_hash: sha256(token),
        purpose,
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    if (!row) return null;
    const user = await this.users.findOne({ where: { id: row.user_id } });
    if (
      !user ||
      !user.is_active ||
      user.email !== row.email ||
      user.token_version !== row.token_version
    ) {
      return null;
    }
    return { row, user };
  }

  private async retireTokens(userId: number, purpose?: TokenPurpose) {
    await this.resets.update(
      { user_id: userId, used_at: IsNull(), ...(purpose ? { purpose } : {}) },
      { used_at: new Date() },
    );
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
