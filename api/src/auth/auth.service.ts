import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; name: string; role: string };
}

/**
 * Brute-force limit per (account, client IP): 10 failures / 15 min → 429 for that pair only,
 * so an attacker cannot lock a victim out from elsewhere. Entries exist only for accounts
 * that exist, expire with the window and the map is bounded.
 */
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

@Injectable()
export class AuthService {
  private readonly failures = new Map<string, number[]>();

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
    const key = `${account}|${clientIp}`;
    this.assertNotLocked(key);
    const user = await this.users.findByEmail(account);
    if (!user || !user.is_active) {
      // unknown or inactive account: no state is created (prevents enumeration + map growth)
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.users.verifyPassword(user, password ?? '');
    if (!ok) {
      this.recordFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.failures.delete(key);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
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
        'Too many failed attempts for this account, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(key: string): void {
    const list = this.failures.get(key) ?? [];
    list.push(Date.now());
    this.failures.set(key, list.slice(-FAILURE_LIMIT));
  }

  /** Drop expired entries; if still above the cap, drop the oldest (insertion order). */
  private evict(now: number): void {
    for (const [k, list] of this.failures) {
      if (!list.some((t) => now - t < FAILURE_WINDOW_MS))
        this.failures.delete(k);
    }
    while (this.failures.size > MAX_TRACKED) {
      const oldest = this.failures.keys().next().value;
      if (oldest === undefined) break;
      this.failures.delete(oldest);
    }
  }
}
