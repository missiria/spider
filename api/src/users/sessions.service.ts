import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { In, IsNull, Repository } from 'typeorm';
import { UserSession } from './entities/user-session.entity';
import { User } from './entities/user.entity';

/**
 * Presence model (MISS-0199). A member is **online** while at least one of their sessions
 * is not ended, still matches their token_version and made an authenticated request in the
 * last PRESENCE_TIMEOUT_MS. Every signed-in page sends a heartbeat (GET /auth/me) every
 * 2 min while the tab is visible (web AppShell), so a visible tab keeps its session fresh;
 * signing out ends it at once, closing or hiding the tab lets it lapse after the timeout.
 * Being listed as a member is separate: signing out never removes anyone.
 */
export const PRESENCE_TIMEOUT_MS = 5 * 60_000;
/** last_seen_at is written at most once per session per minute */
export const TOUCH_INTERVAL_MS = 60_000;
/** ended or idle rows are kept this long for "last seen", then purged */
export const SESSION_RETENTION_MS = 7 * 24 * 60 * 60_000;

export interface Presence {
  online: boolean;
  /** most recent authenticated request over all sessions, null if never signed in since MISS-0199 */
  last_seen_at: Date | null;
  /** sessions that currently count as online */
  sessions: number;
}

export type SessionCheck = 'ok' | 'ended';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly repo: Repository<UserSession>,
  ) {}

  /** A new sign-in: returns the id to put in the JWT as `jti`. */
  async start(user: User, userAgent?: string | null, now = new Date()) {
    const id = randomBytes(16).toString('hex');
    await this.repo.insert({
      id,
      user_id: user.id,
      token_version: user.token_version,
      user_agent: userAgent ? userAgent.slice(0, 255) : null,
      last_seen_at: now,
      ended_at: null,
    });
    return id;
  }

  /**
   * Called on every authenticated request carrying a `jti`. A missing row (purged, or
   * another user's id) or an ended one means the token no longer opens a session.
   */
  async touch(
    id: string,
    userId: number,
    now = new Date(),
  ): Promise<SessionCheck> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || row.user_id !== userId || row.ended_at) return 'ended';
    if (
      now.getTime() - new Date(row.last_seen_at).getTime() >=
      TOUCH_INTERVAL_MS
    ) {
      await this.repo.update({ id }, { last_seen_at: now });
    }
    return 'ok';
  }

  /** Sign-out of one browser: only this token stops working. */
  async end(id: string, userId: number, now = new Date()): Promise<void> {
    await this.repo.update(
      { id, user_id: userId, ended_at: IsNull() },
      { ended_at: now },
    );
  }

  /** "Sign out everywhere" and friends: every open session of the user ends now. */
  async endAll(userId: number, now = new Date()): Promise<void> {
    await this.repo.update(
      { user_id: userId, ended_at: IsNull() },
      { ended_at: now },
    );
  }

  /** Presence for each id; users without any session row get offline / never seen. */
  async presenceFor(
    users: Pick<User, 'id' | 'token_version'>[],
    now = new Date(),
  ): Promise<Map<number, Presence>> {
    const out = new Map<number, Presence>();
    for (const u of users)
      out.set(u.id, { online: false, last_seen_at: null, sessions: 0 });
    if (!users.length) return out;
    const versions = new Map(users.map((u) => [u.id, u.token_version]));
    const rows = await this.repo.find({
      where: { user_id: In(users.map((u) => u.id)) },
    });
    const cutoff = now.getTime() - PRESENCE_TIMEOUT_MS;
    for (const r of rows) {
      const p = out.get(r.user_id);
      if (!p) continue;
      const seen = new Date(r.last_seen_at);
      if (!p.last_seen_at || seen > p.last_seen_at) p.last_seen_at = seen;
      if (
        !r.ended_at &&
        r.token_version === versions.get(r.user_id) &&
        seen.getTime() > cutoff
      ) {
        p.sessions += 1;
        p.online = true;
      }
    }
    return out;
  }

  @Cron('20 3 * * *')
  async purge(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - SESSION_RETENTION_MS);
    const res = await this.repo
      .createQueryBuilder()
      .delete()
      .where('last_seen_at < :before', { before })
      .orWhere('ended_at < :before', { before })
      .execute();
    const n = res.affected ?? 0;
    if (n) this.logger.log(`purged ${n} old sessions`);
    return n;
  }
}
