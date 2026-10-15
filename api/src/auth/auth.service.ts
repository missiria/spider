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

/** Per-account brute-force limit, independent of the IP-based throttle: 10 failures / 15 min. */
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<AuthResponse> {
    const key = (email ?? '').trim().toLowerCase();
    this.assertNotLocked(key);
    const user = await this.users.findByEmail(key);
    if (!user || !user.is_active) {
      this.recordFailure(key);
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
    const recent = (this.failures.get(key) ?? []).filter(
      (t) => now - t < FAILURE_WINDOW_MS,
    );
    this.failures.set(key, recent);
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
}
