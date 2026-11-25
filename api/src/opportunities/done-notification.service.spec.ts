/* eslint-disable @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../integrations/mailer.service';
import { User } from '../users/entities/user.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { renderDoneNotification } from './done-notification';
import { DoneNotificationService } from './done-notification.service';
import { Opportunity } from './entities/opportunity.entity';

function user(id: number, over: Partial<User> = {}): User {
  return {
    id,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    role: 'member',
    is_active: true,
    approval_status: 'approved',
    weekly_opportunities_email: true,
    ...over,
  } as User;
}

const OPP = {
  id: 474,
  workspace_id: 1,
  property_id: 10,
  property: { display_name: 'example.com' },
  rule: 'not_indexed_reason',
  priority: 'high',
  key_text: 'Crawled - currently not indexed',
  title: 'Pages crawled but not indexed',
  status: 'done',
  completed_at: new Date('2026-11-25T20:00:00Z'),
} as unknown as Opportunity;

function setup(opts: {
  members: { workspace_id: number; user: User | null }[];
  smtp?: boolean;
  failFor?: string;
}) {
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const members = {
    find: jest.fn(async ({ where }: { where: { workspace_id: number } }) =>
      opts.members
        .map((m, i) => ({ id: i + 1, ...m }))
        .filter((m) => m.workspace_id === where.workspace_id),
    ),
  };
  const users = {
    findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
      user(where.id, { name: 'Alice Admin' }),
    ),
  };
  const workspaces = {
    get: jest.fn(async (id: number) => ({ id, name: 'MISSIRIA' })),
    runAs: jest.fn((_id: number, fn: () => Promise<unknown>) => fn()),
  };
  const mailer = {
    send: jest.fn(
      async (m: { to: string[]; subject: string; text: string }) => {
        if (opts.failFor && m.to[0] === opts.failFor) throw new Error('boom');
        sent.push(m);
        return { skipped: opts.smtp === false };
      },
    ),
  };
  const config = {
    get: (k: string) =>
      k === 'APP_PUBLIC_URL' ? 'https://spider.missiria.dev/' : undefined,
  };
  const svc = new DoneNotificationService(
    members as never,
    users as never,
    workspaces as unknown as WorkspacesService,
    mailer as unknown as MailerService,
    config as unknown as ConfigService,
  );
  return { svc, sent, mailer, workspaces };
}

describe('DoneNotificationService (MISS-0198)', () => {
  it('mails every active approved member of the workspace, one message each', async () => {
    const { svc, sent } = setup({
      members: [
        { workspace_id: 1, user: user(1, { role: 'admin' }) },
        { workspace_id: 1, user: user(2) },
        { workspace_id: 1, user: user(3, { is_active: false }) },
        { workspace_id: 1, user: user(4, { approval_status: 'pending' }) },
        { workspace_id: 1, user: user(5, { email: 'not-an-email' }) },
        {
          workspace_id: 1,
          user: user(6, { weekly_opportunities_email: false }),
        },
        { workspace_id: 1, user: null },
        { workspace_id: 2, user: user(9) },
      ],
    });
    const r = await svc.notify(OPP, 1, 'Fixed canonical tags');
    expect(r).toEqual({ recipients: 3, sent: 3, skipped: 0, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual([
      ['user1@example.com'],
      ['user2@example.com'],
      ['user6@example.com'],
    ]);
    expect(sent[0].subject).toBe('Done: Pages crawled but not indexed');
    expect(sent[0].text).toContain('Alice Admin marked an opportunity as done');
    expect(sent[0].text).toContain('Note: Fixed canonical tags');
    expect(sent[0].text).toContain(
      'https://spider.missiria.dev/opportunities/474',
    );
  });

  it('never reaches members of another workspace', async () => {
    const { svc, sent } = setup({
      members: [{ workspace_id: 2, user: user(9) }],
    });
    const r = await svc.notify(OPP, 1);
    expect(r.recipients).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('dedups the same address and keeps going when one send fails', async () => {
    const { svc } = setup({
      members: [
        { workspace_id: 1, user: user(1) },
        { workspace_id: 1, user: user(7, { email: 'USER1@example.com' }) },
        { workspace_id: 1, user: user(2) },
        { workspace_id: 1, user: user(3) },
      ],
      failFor: 'user2@example.com',
    });
    expect(await svc.notify(OPP, 1)).toEqual({
      recipients: 3,
      sent: 2,
      skipped: 0,
      failed: 1,
    });
  });

  it('counts skipped when SMTP is not configured', async () => {
    const { svc } = setup({
      members: [{ workspace_id: 1, user: user(1) }],
      smtp: false,
    });
    expect(await svc.notify(OPP, 1)).toMatchObject({ sent: 0, skipped: 1 });
  });

  it('dispatch runs inside the opportunity workspace scope and swallows errors', async () => {
    const { svc, workspaces, mailer } = setup({
      members: [{ workspace_id: 1, user: user(1) }],
      failFor: 'user1@example.com',
    });
    expect(() => svc.dispatch(OPP, 1)).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(workspaces.runAs).toHaveBeenCalledWith(1, expect.any(Function));
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});

describe('renderDoneNotification', () => {
  const base = {
    id: 474,
    title: 'Pages   crawled\nbut not indexed',
    property_name: 'example.com',
    rule: 'not_indexed_reason',
    priority: 'high' as const,
    key_text: '',
    actor_name: '',
    workspace_name: 'MISSIRIA',
    completed_at: new Date('2026-11-25T20:00:00Z'),
    publicUrl: 'https://spider.missiria.dev/',
  };

  it('renders facts, link and falls back when the actor has no name', () => {
    const { subject, text } = renderDoneNotification(base);
    expect(subject).toBe('Done: Pages crawled but not indexed');
    expect(text).toContain(
      'A teammate marked an opportunity as done in MISSIRIA.',
    );
    expect(text).toContain('Rule: Not indexed reason');
    expect(text).toContain('Priority: High');
    expect(text).not.toContain('Subject:');
    expect(text).not.toContain('Note:');
    expect(text).toContain('→ https://spider.missiria.dev/opportunities/474');
  });

  it('clips a long note', () => {
    const { text } = renderDoneNotification({
      ...base,
      note: 'x'.repeat(2000),
    });
    const line = text.split('\n').find((l) => l.startsWith('Note: '))!;
    expect(line.length).toBeLessThanOrEqual(606);
    expect(line.endsWith('…')).toBe(true);
  });
});
