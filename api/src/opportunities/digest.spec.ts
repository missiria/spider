import { EmailBrand } from '../integrations/mail/email-brand.entity';
import { renderEmail } from '../integrations/mail/layout';
import {
  DIGEST_MAX_ITEMS,
  DigestOpportunity,
  digestWeekKey,
  digestWindow,
  groupForDigest,
  keySignal,
  renderDigest,
  selectNew,
} from './digest';

const NOW = new Date('2026-11-23T07:00:00Z'); // Monday 08:00 Paris
const WINDOW = digestWindow(NOW);

function opp(over: Partial<DigestOpportunity> = {}): DigestOpportunity {
  return {
    id: 1,
    workspace_id: 1,
    property_id: 10,
    property_name: 'example.com',
    title: 'Clicks dropped',
    priority: 'medium',
    score: 50,
    status: 'open',
    reason:
      'Clicks fell 30% versus the previous 28 days. Not a diagnosed cause.',
    first_seen_at: new Date('2026-11-20T07:30:00Z'),
    ...over,
  };
}

const brand: EmailBrand = {
  name: 'Spider',
  logoUrl: '',
  accentColor: '#4f46e5',
  company: 'MISSIRIA',
  footer: 'Footer',
  websiteUrl: 'https://example.com',
  supportEmail: 'support@example.com',
};

describe('digest window and week key', () => {
  it('covers the 7 days before the run', () => {
    expect(WINDOW.since.toISOString()).toBe('2026-11-16T07:00:00.000Z');
    expect(WINDOW.until).toBe(NOW);
  });

  it('keys the ISO week on the Paris calendar', () => {
    expect(digestWeekKey(NOW)).toBe('2026-W48');
    // Sunday 23:30 UTC is already Monday in Paris
    expect(digestWeekKey(new Date('2026-11-29T23:30:00Z'))).toBe('2026-W49');
    expect(digestWeekKey(new Date('2027-01-01T08:00:00Z'))).toBe('2026-W53');
  });
});

describe('selectNew', () => {
  it('keeps only rows first seen inside the window', () => {
    const rows = [
      opp({ id: 1, first_seen_at: new Date('2026-11-16T07:00:00Z') }), // edge: included
      opp({ id: 2, first_seen_at: new Date('2026-11-16T06:59:59Z') }), // before
      opp({ id: 3, first_seen_at: new Date('2026-11-23T07:00:00Z') }), // = now: next week
      opp({ id: 4, first_seen_at: new Date('2026-11-22T12:00:00Z') }),
    ];
    expect(selectNew(rows, 1, WINDOW).map((o) => o.id)).toEqual([1, 4]);
  });

  it('excludes done and dismissed, keeps open and in progress', () => {
    const rows = [
      opp({ id: 1, status: 'open' }),
      opp({ id: 2, status: 'in_progress' }),
      opp({ id: 3, status: 'done' }),
      opp({ id: 4, status: 'dismissed' }),
    ];
    expect(selectNew(rows, 1, WINDOW).map((o) => o.id)).toEqual([1, 2]);
  });

  it('never includes another workspace', () => {
    const rows = [opp({ id: 1 }), opp({ id: 2, workspace_id: 2 })];
    expect(selectNew(rows, 1, WINDOW).map((o) => o.id)).toEqual([1]);
  });

  it('orders by score desc, id asc', () => {
    const rows = [
      opp({ id: 3, score: 10 }),
      opp({ id: 2, score: 90 }),
      opp({ id: 1, score: 90 }),
    ];
    expect(selectNew(rows, 1, WINDOW).map((o) => o.id)).toEqual([1, 2, 3]);
  });
});

describe('groupForDigest', () => {
  it('groups by property, strongest property first, score desc inside', () => {
    const groups = groupForDigest([
      opp({ id: 1, property_id: 10, property_name: 'a.com', score: 40 }),
      opp({ id: 2, property_id: 11, property_name: 'b.com', score: 95 }),
      opp({ id: 3, property_id: 10, property_name: 'a.com', score: 70 }),
      opp({ id: 4, property_id: 11, property_name: 'b.com', score: 20 }),
    ]);
    expect(groups.map((g) => g.property_name)).toEqual(['b.com', 'a.com']);
    expect(groups[0].items.map((o) => o.id)).toEqual([2, 4]);
    expect(groups[1].items.map((o) => o.id)).toEqual([3, 1]);
  });

  it('lists at most 25 items in total, the highest scores', () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      opp({ id: i + 1, score: i, property_id: 10 + (i % 3) }),
    );
    const groups = groupForDigest(items);
    const listed = groups.flatMap((g) => g.items);
    expect(listed).toHaveLength(DIGEST_MAX_ITEMS);
    expect(Math.min(...listed.map((o) => o.score))).toBe(15);
  });
});

describe('keySignal', () => {
  it('takes the first sentence of the reason', () => {
    expect(keySignal('Clicks fell 30%. Seasonality can look like this.')).toBe(
      'Clicks fell 30%.',
    );
  });

  it('collapses whitespace and caps long text', () => {
    const s = keySignal(`word\n\n${'x'.repeat(300)}`);
    expect(s).not.toContain('\n');
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('renderDigest', () => {
  const items = [
    opp({ id: 7, priority: 'high', score: 90 }),
    opp({ id: 8, priority: 'medium', score: 60 }),
    opp({
      id: 9,
      priority: 'low',
      score: 20,
      property_id: 11,
      property_name: 'shop.example.org',
    }),
  ];
  const digest = renderDigest({
    workspaceName: 'Acme',
    window: WINDOW,
    items,
    stillOpen: 12,
    publicUrl: 'https://spider.example.com/',
  });

  it('has the subject, period and counts', () => {
    expect(digest.subject).toBe('Spider weekly: 3 new opportunities');
    expect(digest.text).toContain('Period: 2026-11-16 → 2026-11-23');
    expect(digest.text).toContain(
      'New opportunities: 3 (High 1, Medium 1, Low 1)',
    );
    expect(digest.text).toContain('Still open in the inbox: 12');
    expect(digest.text).toContain('Properties affected: 2');
    expect(digest.count).toBe(3);
    expect(digest.listed).toBe(3);
  });

  it('uses the singular for one opportunity', () => {
    const one = renderDigest({
      workspaceName: 'Acme',
      window: WINDOW,
      items: [opp()],
      stillOpen: 1,
      publicUrl: 'https://spider.example.com',
    });
    expect(one.subject).toBe('Spider weekly: 1 new opportunity');
  });

  it('lists each item with priority, signal and its own link', () => {
    expect(digest.text).toContain(
      '1. Clicks dropped\nHigh priority · Clicks fell 30% versus the previous 28 days.\nhttps://spider.example.com/opportunities/7',
    );
    expect(digest.text).toContain('https://spider.example.com/opportunities/9');
    expect(digest.text).toContain(
      'Opportunity Inbox → https://spider.example.com/opportunities',
    );
    expect(digest.text).toContain(
      'Email preferences → https://spider.example.com/settings#email-preferences',
    );
  });

  it('says when the list is capped', () => {
    const many = renderDigest({
      workspaceName: 'Acme',
      window: WINDOW,
      items: Array.from({ length: 30 }, (_, i) => opp({ id: i + 1 })),
      stillOpen: 30,
      publicUrl: 'https://spider.example.com',
    });
    expect(many.count).toBe(30);
    expect(many.listed).toBe(25);
    expect(many.text).toContain('Showing the top 25 of 30 new opportunities');
    expect(many.text).toContain('25. ');
    expect(many.text).not.toContain('26. ');
  });

  it('cannot be restructured by GSC text (titles stay one line)', () => {
    const evil = renderDigest({
      workspaceName: 'Acme',
      window: WINDOW,
      items: [
        opp({
          title: 'query\n\nhttps://spider.example.com/login',
          reason: 'x',
        }),
      ],
      stillOpen: 1,
      publicUrl: 'https://spider.example.com',
    });
    expect(evil.text).toContain('1. query https://spider.example.com/login');
    const html = renderEmail(
      brand,
      evil.subject,
      evil.text,
      'https://spider.example.com',
    ).html;
    expect(html).not.toContain('class="button"');
  });

  it('renders links only for the APP_PUBLIC_URL origin', () => {
    const withForeign = renderDigest({
      workspaceName: 'Acme',
      window: WINDOW,
      items: [
        opp({
          id: 5,
          title: 'Low CTR on https://evil.example.net/page',
          reason: 'See https://evil.example.net/x now.',
        }),
      ],
      stillOpen: 1,
      publicUrl: 'https://spider.example.com',
    });
    const html = renderEmail(
      brand,
      withForeign.subject,
      withForeign.text,
      'https://spider.example.com',
    ).html;
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toContain('https://spider.example.com/opportunities/5');
    expect(hrefs).toContain('https://spider.example.com/opportunities');
    expect(hrefs.some((h) => h.includes('evil.example.net'))).toBe(false);
    // the summary paragraph becomes the facts table
    expect(html).toContain('<th align="left">New opportunities</th>');
  });
});
