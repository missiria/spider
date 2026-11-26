import {
  PRESENCE_TIMEOUT_MS,
  SESSION_RETENTION_MS,
  SessionsService,
  TOUCH_INTERVAL_MS,
} from './sessions.service';
import { UserSession } from './entities/user-session.entity';

/** Minimal in-memory stand-in for the TypeORM repository calls the service makes. */
function fakeRepo() {
  const rows: UserSession[] = [];
  const updates: { where: Partial<UserSession>; set: Partial<UserSession> }[] =
    [];
  const matches = (r: UserSession, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = (r as unknown as Record<string, unknown>)[k];
      // IsNull() / In() FindOperators
      if (v && typeof v === 'object' && '_type' in v) {
        const op = v as { _type: string; _value: unknown };
        if (op._type === 'isNull') return val === null || val === undefined;
        if (op._type === 'in') return (op._value as unknown[]).includes(val);
      }
      return val === v;
    });
  return {
    rows,
    updates,
    insert: async (r: Partial<UserSession>) => {
      rows.push({ created_at: new Date(), ...r } as UserSession);
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => matches(r, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter((r) => matches(r, where)),
    update: async (
      where: Record<string, unknown>,
      set: Partial<UserSession>,
    ) => {
      updates.push({ where: where as Partial<UserSession>, set });
      for (const r of rows) if (matches(r, where)) Object.assign(r, set);
    },
  };
}

const T0 = new Date('2026-11-26T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const user = (id: number, token_version = 0) =>
  ({ id, token_version }) as never;

function setup() {
  const repo = fakeRepo();
  return { repo, svc: new SessionsService(repo as never) };
}

describe('SessionsService (MISS-0199)', () => {
  it('start stores a 32-hex id with the user token_version and a capped user agent', async () => {
    const { repo, svc } = setup();
    const id = await svc.start(user(7, 4), 'x'.repeat(400), T0);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(repo.rows[0]).toMatchObject({
      id,
      user_id: 7,
      token_version: 4,
      last_seen_at: T0,
      ended_at: null,
    });
    expect(repo.rows[0].user_agent).toHaveLength(255);
  });

  it('touch accepts a live session and throttles last_seen_at writes to once a minute', async () => {
    const { repo, svc } = setup();
    const id = await svc.start(user(1), null, T0);
    expect(await svc.touch(id, 1, at(TOUCH_INTERVAL_MS - 1))).toBe('ok');
    expect(repo.updates).toHaveLength(0);
    expect(await svc.touch(id, 1, at(TOUCH_INTERVAL_MS))).toBe('ok');
    expect(repo.rows[0].last_seen_at).toEqual(at(TOUCH_INTERVAL_MS));
  });

  it('touch refuses an ended session, an unknown id and another user’s id', async () => {
    const { svc } = setup();
    const id = await svc.start(user(1), null, T0);
    expect(await svc.touch('f'.repeat(32), 1, T0)).toBe('ended');
    expect(await svc.touch(id, 2, T0)).toBe('ended');
    await svc.end(id, 1, at(1000));
    expect(await svc.touch(id, 1, at(2000))).toBe('ended');
  });

  it('end only closes that session of that user', async () => {
    const { repo, svc } = setup();
    const a = await svc.start(user(1), null, T0);
    const b = await svc.start(user(1), null, T0);
    await svc.end(a, 2, at(1)); // wrong user: no effect
    expect(repo.rows.every((r) => r.ended_at === null)).toBe(true);
    await svc.end(a, 1, at(1));
    expect(repo.rows.find((r) => r.id === a)?.ended_at).toEqual(at(1));
    expect(repo.rows.find((r) => r.id === b)?.ended_at).toBeNull();
  });

  describe('presenceFor', () => {
    it('never signed in → offline, no last seen', async () => {
      const { svc } = setup();
      const p = await svc.presenceFor([user(1)], T0);
      expect(p.get(1)).toEqual({
        online: false,
        last_seen_at: null,
        sessions: 0,
      });
    });

    it('online until PRESENCE_TIMEOUT_MS after the last request, then offline with last seen', async () => {
      const { svc } = setup();
      await svc.start(user(1), null, T0);
      expect(
        (await svc.presenceFor([user(1)], at(PRESENCE_TIMEOUT_MS - 1))).get(1),
      ).toEqual({ online: true, last_seen_at: T0, sessions: 1 });
      expect(
        (await svc.presenceFor([user(1)], at(PRESENCE_TIMEOUT_MS))).get(1),
      ).toEqual({ online: false, last_seen_at: T0, sessions: 0 });
    });

    it('sign-out goes offline at once while keeping last seen', async () => {
      const { svc } = setup();
      const id = await svc.start(user(1), null, T0);
      await svc.end(id, 1, at(1000));
      expect((await svc.presenceFor([user(1)], at(2000))).get(1)).toEqual({
        online: false,
        last_seen_at: T0,
        sessions: 0,
      });
    });

    it('signing out one device keeps the member online through the other', async () => {
      const { svc } = setup();
      const laptop = await svc.start(user(1), null, T0);
      await svc.start(user(1), null, at(30_000));
      await svc.end(laptop, 1, at(60_000));
      expect((await svc.presenceFor([user(1)], at(90_000))).get(1)).toEqual({
        online: true,
        last_seen_at: at(30_000),
        sessions: 1,
      });
    });

    it('a token_version bump (sign out everywhere, reset, deactivation) ends every session', async () => {
      const { svc } = setup();
      await svc.start(user(1, 2), null, T0);
      await svc.start(user(1, 2), null, T0);
      expect(
        (await svc.presenceFor([user(1, 3)], at(1000))).get(1)?.online,
      ).toBe(false);
      expect(
        (await svc.presenceFor([user(1, 2)], at(1000))).get(1)?.sessions,
      ).toBe(2);
    });

    it('keeps users apart', async () => {
      const { svc } = setup();
      await svc.start(user(1), null, T0);
      const p = await svc.presenceFor([user(1), user(2)], at(1));
      expect(p.get(1)?.online).toBe(true);
      expect(p.get(2)?.online).toBe(false);
    });
  });

  it('purge deletes rows idle or ended for longer than the retention', async () => {
    const { svc } = setup();
    const where: unknown[] = [];
    const qb = {
      delete: () => qb,
      where: (_: string, p: unknown) => (where.push(p), qb),
      orWhere: (_: string, p: unknown) => (where.push(p), qb),
      execute: async () => ({ affected: 3 }),
    };
    (
      svc as unknown as { repo: { createQueryBuilder: () => unknown } }
    ).repo.createQueryBuilder = () => qb;
    expect(await svc.purge(at(SESSION_RETENTION_MS))).toBe(3);
    expect(where).toEqual([{ before: T0 }, { before: T0 }]);
  });
});
