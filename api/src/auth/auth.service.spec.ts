/* eslint-disable @typescript-eslint/require-await */
import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  ACCOUNT_SOFT_LIMIT,
  AuthService,
  FAILURE_LIMIT,
  MAX_TRACKED,
  normalizeIp,
} from './auth.service';

const hash = bcrypt.hashSync('right-password', 4);
const approval: Record<string, string> = {
  'known@example.com': 'approved',
  'pending@example.com': 'pending',
  'rejected@example.com': 'rejected',
};
const users = {
  findByEmail: async (email: string) =>
    approval[email]
      ? {
          id: 1,
          email,
          name: 'K',
          role: 'admin',
          is_active: true,
          approval_status: approval[email],
          token_version: 3,
          password_hash: hash,
        }
      : null,
  verifyPassword: (u: { password_hash: string }, p: string) =>
    bcrypt.compare(p, u.password_hash),
};
const jwt = { signAsync: async (p: object) => JSON.stringify(p) };

function service() {
  const svc = new AuthService(users as never, jwt as never);
  const delays: number[] = [];
  (svc as unknown as { sleep: (ms: number) => Promise<void> }).sleep = async (
    ms,
  ) => {
    delays.push(ms);
  };
  return { svc, delays };
}

async function fail(svc: AuthService, email: string, ip: string) {
  await expect(svc.login(email, 'wrong', ip)).rejects.toBeInstanceOf(
    UnauthorizedException,
  );
}

describe('AuthService signup approval', () => {
  it('pending: right password → 403 awaiting approval; wrong password → plain 401', async () => {
    const { svc } = service();
    await fail(svc, 'pending@example.com', '1.1.1.1');
    await expect(
      svc.login('pending@example.com', 'right-password', '1.1.1.1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejected: indistinguishable from bad credentials', async () => {
    const { svc } = service();
    await fail(svc, 'rejected@example.com', '1.1.1.1');
    await expect(
      svc.login('rejected@example.com', 'right-password', '1.1.1.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('clearFailures lifts the lock of that account only', async () => {
    const { svc } = service();
    for (let i = 0; i < FAILURE_LIMIT; i += 1)
      await fail(svc, 'known@example.com', '1.1.1.1');
    svc.clearFailures('Known@Example.com');
    const ok = await svc.login(
      'known@example.com',
      'right-password',
      '1.1.1.1',
    );
    expect(ok.user.id).toBe(1);
  });
});

describe('AuthService brute-force protection', () => {
  it('locks an (account, ip) pair after the limit, other IPs still work', async () => {
    const { svc } = service();
    for (let i = 0; i < FAILURE_LIMIT; i += 1)
      await fail(svc, 'known@example.com', '1.1.1.1');
    await expect(
      svc.login('known@example.com', 'right-password', '1.1.1.1'),
    ).rejects.toBeInstanceOf(HttpException);
    const ok = await svc.login(
      'known@example.com',
      'right-password',
      '2.2.2.2',
    );
    expect(JSON.parse(ok.token)).toMatchObject({ sub: 1, ver: 3 });
  });

  it('treats unknown accounts exactly like known ones (same 401, same lock)', async () => {
    const { svc } = service();
    for (let i = 0; i < FAILURE_LIMIT; i += 1)
      await fail(svc, 'ghost@example.com', '1.1.1.1');
    const err = await svc
      .login('ghost@example.com', 'x', '1.1.1.1')
      .catch((e: HttpException) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).message).not.toMatch(/account/i);
  });

  it('slows the whole account down after the account-wide soft limit, without locking it', async () => {
    const { svc, delays } = service();
    for (let i = 0; i < ACCOUNT_SOFT_LIMIT; i += 1)
      await fail(svc, 'known@example.com', `10.0.${i}.1`);
    expect(delays).toHaveLength(0);
    const ok = await svc.login(
      'known@example.com',
      'right-password',
      '9.9.9.9',
    );
    expect(ok.user.id).toBe(1);
    expect(delays[0]).toBeGreaterThan(0);
    expect(svc.softDelayMs('known@example.com')).toBeLessThanOrEqual(4_000);
  });

  it('keys IPv6 clients by /64 so rotating the interface id does not reset the lock', async () => {
    expect(normalizeIp('2001:db8:1:2:aaaa::1')).toBe(
      '2001:0db8:0001:0002::/64',
    );
    expect(normalizeIp('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe(
      '2001:0db8:0001:0002::/64',
    );
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIp('8.8.8.8')).toBe('8.8.8.8');
    const { svc } = service();
    for (let i = 0; i < FAILURE_LIMIT; i += 1)
      await fail(svc, 'known@example.com', `2001:db8:1:2::${i + 1}`);
    await expect(
      svc.login('known@example.com', 'right-password', '2001:db8:1:2::ffff'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('evicts unlocked entries first when the map is full, keeping active locks', async () => {
    const { svc } = service();
    for (let i = 0; i < FAILURE_LIMIT; i += 1)
      await fail(svc, 'known@example.com', '1.1.1.1');
    const failures = (svc as unknown as { failures: Map<string, number[]> })
      .failures;
    const now = Date.now();
    for (let i = 0; i < MAX_TRACKED + 50; i += 1)
      failures.set(`flood${i}@x|3.3.3.3`, [now]);
    await expect(
      svc.login('known@example.com', 'right-password', '1.1.1.1'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(failures.size).toBeLessThanOrEqual(MAX_TRACKED);
  });
});
