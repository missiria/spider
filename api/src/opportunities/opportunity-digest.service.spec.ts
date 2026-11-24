/* eslint-disable @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config';
import { FindOperator } from 'typeorm';
import { MailerService } from '../integrations/mailer.service';
import { User } from '../users/entities/user.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  currentWorkspaceId,
  requestContext,
} from '../workspaces/request-context';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityDigestService } from './opportunity-digest.service';

const NOW = new Date('2026-11-23T07:00:00Z'); // Monday 08:00 Paris
const DAY = 86_400_000;

/** Evaluates the TypeORM where objects the service uses (plain values, In, Between). */
function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond instanceof FindOperator) {
      if (cond.type === 'in') return (cond.value as unknown[]).includes(v);
      if (cond.type === 'between') {
        const [a, b] = cond.value as unknown as [Date, Date];
        const t = (v as Date).getTime();
        return t >= a.getTime() && t <= b.getTime();
      }
      throw new Error(`unsupported operator ${cond.type}`);
    }
    return v === cond;
  });
}

function user(id: number, over: Partial<User> = {}): User {
  return {
    id,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    role: 'admin',
    is_active: true,
    approval_status: 'approved',
    weekly_opportunities_email: true,
    ...over,
  } as User;
}

function opp(id: number, over: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    workspace_id: 1,
    property_id: 10,
    property: { display_name: 'example.com' },
    title: `Opportunity ${id}`,
    priority: 'medium',
    score: 50,
    status: 'open',
    reason: 'Clicks fell 30%. Context.',
    first_seen_at: new Date(NOW.getTime() - 2 * DAY),
    ...over,
  } as Opportunity;
}

function setup(opts: {
  opportunities?: Opportunity[];
  members?: { workspace_id: number; user: User }[];
  smtp?: boolean;
  sendError?: Error;
  workspaces?: { id: number; slug: string; name: string }[];
}) {
  const opportunities = opts.opportunities ?? [];
  const members = (opts.members ?? []).map((m, i) => ({ id: i + 1, ...m }));
  const deliveries: Record<string, unknown>[] = [];
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const workspaces = opts.workspaces ?? [
    { id: 1, slug: 'one', name: 'One' },
    { id: 2, slug: 'two', name: 'Two' },
  ];
  const oppRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      opportunities.filter((o) => matches(o as never, where)),
    ),
    count: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        opportunities.filter((o) => matches(o as never, where)).length,
    ),
  };
  const deliveryRepo = {
    create: (e: Record<string, unknown>) => ({ ...e }),
    save: jest.fn(async (e: Record<string, unknown>) => {
      if (e.id) {
        Object.assign(
          deliveries.find((d) => d.id === e.id)!,
          e,
        );
        return e;
      }
      if (
        deliveries.some(
          (d) =>
            d.user_id === e.user_id &&
            d.workspace_id === e.workspace_id &&
            d.week_key === e.week_key,
        )
      ) {
        throw Object.assign(new Error('Duplicate entry'), {
          code: 'ER_DUP_ENTRY',
        });
      }
      const row = { ...e, id: deliveries.length + 1 };
      deliveries.push(row);
      return { ...row };
    }),
  };
  const memberRepo = {
    find: jest.fn(async ({ where }: { where: { workspace_id: number } }) =>
      members.filter((m) => m.workspace_id === where.workspace_id),
    ),
  };
  const ws = {
    all: async () => workspaces,
    runAs: <T>(id: number, fn: () => Promise<T>) =>
      requestContext.run({ user: null, workspaceId: id }, fn),
    currentId: () => {
      const id = currentWorkspaceId();
      if (id === null) throw new Error('No workspace scope');
      return id;
    },
    current: async () => {
      const id = currentWorkspaceId();
      if (id === null) throw new Error('No workspace scope');
      return workspaces.find((w) => w.id === id)!;
    },
  } as unknown as WorkspacesService;
  const mailer = {
    send: jest.fn(
      async (m: { to: string[]; subject: string; text: string }) => {
        if (opts.sendError) throw opts.sendError;
        if (opts.smtp === false) return { skipped: true };
        sent.push(m);
        return { skipped: false, messageId: 'x' };
      },
    ),
  } as unknown as MailerService;
  const svc = new OpportunityDigestService(
    oppRepo as never,
    deliveryRepo as never,
    memberRepo as never,
    ws,
    mailer,
    new ConfigService({ APP_PUBLIC_URL: 'https://spider.example.com/' }),
  );
  return { svc, deliveries, sent, mailer, deliveryRepo };
}

describe('OpportunityDigestService', () => {
  it('emails each admin of a workspace its own new opportunities', async () => {
    const t = setup({
      opportunities: [
        opp(1, { score: 90, priority: 'high' }),
        opp(2, { status: 'in_progress' }),
        opp(3, { status: 'done' }),
        opp(4, { status: 'dismissed' }),
        opp(5, { first_seen_at: new Date(NOW.getTime() - 8 * DAY) }), // older
        opp(6, {
          workspace_id: 2,
          title: 'Other tenant secret',
          property: { display_name: 'other.com' } as never,
        }),
      ],
      members: [
        { workspace_id: 1, user: user(1) },
        { workspace_id: 2, user: user(2) },
      ],
    });
    const r = await t.svc.runWeekly(NOW);
    expect(r).toMatchObject({ workspaces: 2, sent: 2, duplicate: 0 });
    const one = t.sent.find((m) => m.to[0] === 'user1@example.com')!;
    expect(one.subject).toBe('Spider weekly: 2 new opportunities');
    expect(one.text).toContain('https://spider.example.com/opportunities/1');
    expect(one.text).toContain('https://spider.example.com/opportunities/2');
    for (const id of [3, 4, 5, 6])
      expect(one.text).not.toContain(`/opportunities/${id}\n`);
    expect(one.text).not.toContain('Other tenant secret');
    expect(one.text).not.toContain('other.com');
    // still open counts open + in progress of this workspace only (1, 2, 5)
    expect(one.text).toContain('Still open in the inbox: 3');
    const two = t.sent.find((m) => m.to[0] === 'user2@example.com')!;
    expect(two.subject).toBe('Spider weekly: 1 new opportunity');
    expect(two.text).toContain('Other tenant secret');
    expect(two.text).not.toContain('/opportunities/1\n');
    expect(t.deliveries).toEqual([
      expect.objectContaining({
        workspace_id: 1,
        user_id: 1,
        week_key: '2026-W48',
        status: 'sent',
        opportunity_count: 2,
        sent_at: NOW,
        error: null,
      }),
      expect.objectContaining({
        workspace_id: 2,
        user_id: 2,
        status: 'sent',
        opportunity_count: 1,
      }),
    ]);
  });

  it('sends nothing and claims nothing for an empty week', async () => {
    const t = setup({
      opportunities: [opp(1, { status: 'done' })],
      members: [{ workspace_id: 1, user: user(1) }],
    });
    const r = await t.svc.runWeekly(NOW);
    expect(r.empty).toBe(2);
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.deliveries).toHaveLength(0);
  });

  it('never emails the same recipient twice in the same ISO week', async () => {
    const rows = [opp(1)];
    const t = setup({
      opportunities: rows,
      members: [{ workspace_id: 1, user: user(1) }],
    });
    await t.svc.runWeekly(NOW);
    // rerun the same morning, and after a restart later that week
    const again = await t.svc.runWeekly(new Date(NOW.getTime() + 60_000));
    const later = await t.svc.runWeekly(new Date(NOW.getTime() + 3 * DAY));
    expect(again).toMatchObject({ sent: 0, duplicate: 1 });
    expect(later).toMatchObject({ sent: 0, duplicate: 1 });
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    expect(t.deliveries).toHaveLength(1);
    // next Monday is a new week with its own new opportunity
    rows.push(opp(2, { first_seen_at: new Date(NOW.getTime() + 5 * DAY) }));
    const next = await t.svc.runWeekly(new Date(NOW.getTime() + 7 * DAY));
    expect(next).toMatchObject({ sent: 1, duplicate: 0 });
    expect(t.deliveries.map((d) => d.week_key)).toEqual([
      '2026-W48',
      '2026-W49',
    ]);
  });

  it('a concurrent worker that loses the claim race does not send', async () => {
    const t = setup({
      opportunities: [opp(1)],
      members: [{ workspace_id: 1, user: user(1) }],
    });
    await Promise.all([t.svc.runWeekly(NOW), t.svc.runWeekly(NOW)]);
    expect(t.mailer.send).toHaveBeenCalledTimes(1);
    expect(t.deliveries).toHaveLength(1);
  });

  it('respects the opt-out and only mails active, approved admins', async () => {
    const t = setup({
      opportunities: [opp(1)],
      members: [
        {
          workspace_id: 1,
          user: user(1, { weekly_opportunities_email: false }),
        },
        { workspace_id: 1, user: user(2, { role: 'member' }) },
        { workspace_id: 1, user: user(3, { is_active: false }) },
        { workspace_id: 1, user: user(4, { approval_status: 'pending' }) },
        { workspace_id: 1, user: user(5, { email: 'not-an-email' }) },
        { workspace_id: 1, user: user(6) },
      ],
    });
    const r = await t.svc.runWeekly(NOW);
    expect(r.sent).toBe(1);
    expect(t.sent.map((m) => m.to)).toEqual([['user6@example.com']]);
    expect(t.deliveries.map((d) => d.user_id)).toEqual([6]);
  });

  it('records skipped when SMTP is not configured', async () => {
    const t = setup({
      opportunities: [opp(1)],
      members: [{ workspace_id: 1, user: user(1) }],
      smtp: false,
    });
    const r = await t.svc.runWeekly(NOW);
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
    expect(t.deliveries[0]).toMatchObject({
      status: 'skipped',
      error: 'SMTP not configured',
      sent_at: null,
    });
  });

  it('records a failed send and keeps going', async () => {
    const t = setup({
      opportunities: [opp(1)],
      members: [
        { workspace_id: 1, user: user(1) },
        { workspace_id: 1, user: user(2) },
      ],
      sendError: new Error('connection refused'),
    });
    const r = await t.svc.runWeekly(NOW);
    expect(r.failed).toBe(2);
    expect(t.deliveries[0]).toMatchObject({
      status: 'failed',
      error: 'connection refused',
    });
  });

  it('previews the current workspace without sending or claiming', async () => {
    const t = setup({
      opportunities: [opp(1), opp(2, { workspace_id: 2 })],
      members: [{ workspace_id: 1, user: user(1) }],
    });
    const p = await requestContext.run({ user: null, workspaceId: 1 }, () =>
      t.svc.preview(NOW),
    );
    expect(p).toMatchObject({
      week_key: '2026-W48',
      opportunity_count: 1,
      would_send: true,
      recipients: ['user1@example.com'],
      subject: 'Spider weekly: 1 new opportunity',
    });
    expect(p.text).not.toContain('/opportunities/2');
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.deliveries).toHaveLength(0);
  });

  it('refuses to run outside a workspace scope', async () => {
    const t = setup({});
    await expect(t.svc.runWorkspace(NOW)).rejects.toThrow('No workspace scope');
  });
});
