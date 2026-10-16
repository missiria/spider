import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; name: string; role: string };
}

/**
 * Brute-force protection, two layers:
 *  - hard lock per (account, client IP): 10 failures / 15 min → 429 for that pair only, so an
 *    attacker cannot lock a victim out from elsewhere. Unknown accounts are tracked the same
 *    way (bounded map), so the lock reveals nothing about which accounts exist.
 *  - soft, account-wide: past 20 failures / 15 min from anywhere, every attempt on that account
 *    (including the right password) waits a progressive delay (0.5 s … 4 s). Slows distributed
 *    guessing without a denial-of-service lever.
 * Unknown accounts still run a bcrypt compare so response time does not leak existence.
 * IPv6 clients are keyed by their /64 (one subscriber usually owns the whole prefix).
 */
export const FAILURE_LIMIT = 10;
export const FAILURE_WINDOW_MS = 15 * 60_000;
export const ACCOUNT_SOFT_LIMIT = 20;
export const MAX_TRACKED = 10_000;
const MAX_DELAY_MS = 4_000;
// hash of a random string, computed once: used for the dummy compare on unknown accounts
const DUMMY_HASH = bcrypt.hashSync('spider-dummy-password', 10);

@Injectable()
export class AuthService {
  /** (account|ip) → failure timestamps */
  private readonly failures = new Map<string, number[]>();
  /** account → failure timestamps from any IP */
  private readonly accountFailures = new Map<string, number[]>();
  /** test hook: resolves after the soft delay */
  protected sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms));

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
    clientIp = 'unknown',
  ): Promise<AuthResponse> {
    const account = (email ?? '').trim().toLowerCase();
    const key = `${account}|${normalizeIp(clientIp)}`;
    this.assertNotLocked(key);
    await this.softDelay(account);
    const user = await this.users.findByEmail(account);
    let ok = false;
    if (user) {
      ok = await this.users.verifyPassword(user, password ?? '');
    } else {
      // same cost as a real check so timing does not reveal unknown accounts
      await bcrypt.compare(password ?? '', DUMMY_HASH);
    }
    if (!user || !user.is_active || !ok) {
      this.recordFailure(key, account);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.failures.delete(key);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ver: user.token_version,
    };
    return {
      token: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /** How long the next attempt on `account` waits (0 when under the soft limit). */
  softDelayMs(account: string, now = Date.now()): number {
    const recent = (this.accountFailures.get(account) ?? []).filter(
      (t) => now - t < FAILURE_WINDOW_MS,
    );
    if (recent.length) this.accountFailures.set(account, recent);
    else this.accountFailures.delete(account);
    if (recent.length < ACCOUNT_SOFT_LIMIT) return 0;
    const over = recent.length - ACCOUNT_SOFT_LIMIT;
    return Math.min(MAX_DELAY_MS, 500 * 2 ** Math.min(over, 3));
  }

  private async softDelay(account: string): Promise<void> {
    const ms = this.softDelayMs(account);
    if (ms > 0) await this.sleep(ms);
  }

  private assertNotLocked(key: string): void {
    const now = Date.now();
    this.evict(now);
    const recent = (this.failures.get(key) ?? []).filter(
      (t) => now - t < FAILURE_WINDOW_MS,
    );
    if (recent.length) this.failures.set(key, recent);
    else this.failures.delete(key);
    if (recent.length >= FAILURE_LIMIT) {
      throw new HttpException(
        'Too many failed attempts, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(key: string, account: string): void {
    const now = Date.now();
    const list = this.failures.get(key) ?? [];
    list.push(now);
    this.failures.set(key, list.slice(-FAILURE_LIMIT));
    const acc = this.accountFailures.get(account) ?? [];
    acc.push(now);
    this.accountFailures.set(account, acc.slice(-(ACCOUNT_SOFT_LIMIT + 8)));
  }

  /**
   * Drop expired entries. Above the cap, drop unlocked entries first (oldest insertion);
   * locked pairs are only evicted when nothing else is left, so flooding the map with new
   * accounts cannot clear an active lock cheaply.
   */
  private evict(now: number): void {
    const isLive = (t: number) => now - t < FAILURE_WINDOW_MS;
    for (const [k, list] of this.failures) {
      if (!list.some(isLive)) this.failures.delete(k);
    }
    for (const [k, list] of this.accountFailures) {
      if (!list.some(isLive)) this.accountFailures.delete(k);
    }
    if (this.failures.size > MAX_TRACKED) {
      for (const [k, list] of this.failures) {
        if (this.failures.size <= MAX_TRACKED) break;
        if (list.filter(isLive).length < FAILURE_LIMIT) this.failures.delete(k);
      }
      while (this.failures.size > MAX_TRACKED) {
        const oldest = this.failures.keys().next().value;
        if (oldest === undefined) break;
        this.failures.delete(oldest);
      }
    }
    while (this.accountFailures.size > MAX_TRACKED) {
      const oldest = this.accountFailures.keys().next().value;
      if (oldest === undefined) break;
      this.accountFailures.delete(oldest);
    }
  }
}

/** IPv6 → /64 prefix; IPv4 and anything else unchanged. */
export function normalizeIp(ip: string): string {
  if (!ip.includes(':')) return ip;
  const v = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!v.includes(':')) return v; // IPv4-mapped
  const full = expandV6(v);
  return full ? `${full.slice(0, 4).join(':')}::/64` : ip;
}

function expandV6(ip: string): string[] | null {
  const zone = ip.indexOf('%');
  const s = (zone === -1 ? ip : ip.slice(0, zone)).toLowerCase();
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  return groups.length === 8 ? groups.map((g) => g.padStart(4, '0')) : null;
}
