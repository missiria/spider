/**
 * Weekly opportunities email (MISS-0196): pure selection and rendering, unit-tested. The text
 * goes through MailerService → renderEmail, so it only uses what that layout understands:
 * blank-line paragraphs, "Label: value" fact tables, and HTTPS links to APP_PUBLIC_URL.
 */
import type {
  OpportunityPriority,
  OpportunityStatus,
} from './entities/opportunity.entity';

export const DIGEST_WINDOW_DAYS = 7;
/** at most this many opportunities are listed; the summary still counts all of them */
export const DIGEST_MAX_ITEMS = 25;
/** statuses that still need work; done and dismissed items never appear in a digest */
export const DIGEST_STATUSES: OpportunityStatus[] = ['open', 'in_progress'];
const SIGNAL_MAX = 160;

export interface DigestOpportunity {
  id: number;
  workspace_id: number;
  property_id: number;
  property_name: string;
  title: string;
  priority: OpportunityPriority;
  score: number;
  status: OpportunityStatus;
  reason: string;
  first_seen_at: Date;
}

export interface DigestWindow {
  since: Date;
  until: Date;
}

export interface DigestContent {
  subject: string;
  text: string;
  /** new opportunities in the window (before the list cap) */
  count: number;
  listed: number;
}

/** The 7 days before `now`: consecutive Monday runs tile the timeline without gaps. */
export function digestWindow(now: Date): DigestWindow {
  return {
    since: new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86_400_000),
    until: now,
  };
}

/**
 * New opportunities of ONE workspace: first seen inside the window and still open. Applied
 * again in memory on top of the SQL filter so a wrong query can never widen the digest.
 */
export function selectNew(
  rows: DigestOpportunity[],
  workspaceId: number,
  window: DigestWindow,
): DigestOpportunity[] {
  return rows
    .filter(
      (o) =>
        o.workspace_id === workspaceId &&
        DIGEST_STATUSES.includes(o.status) &&
        o.first_seen_at.getTime() >= window.since.getTime() &&
        o.first_seen_at.getTime() < window.until.getTime(),
    )
    .sort((a, b) => b.score - a.score || a.id - b.id);
}

/** One line of the rule's reason: its first sentence, whitespace collapsed, capped. */
export function keySignal(reason: string): string {
  const flat = oneLine(reason);
  const first = flat.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? flat;
  return first.length > SIGNAL_MAX
    ? `${first.slice(0, SIGNAL_MAX - 1).trimEnd()}…`
    : first;
}

/** Titles and reasons hold GSC data (queries, URLs): never let them add lines or paragraphs. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const PRIORITY_ORDER: OpportunityPriority[] = ['high', 'medium', 'low'];
const label = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Groups by property (strongest property first), score desc inside, max 25 items in total. */
export function groupForDigest(
  items: DigestOpportunity[],
  max = DIGEST_MAX_ITEMS,
): {
  property_id: number;
  property_name: string;
  items: DigestOpportunity[];
}[] {
  const top = [...items]
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, max);
  const groups = new Map<
    number,
    { property_id: number; property_name: string; items: DigestOpportunity[] }
  >();
  for (const o of top) {
    let g = groups.get(o.property_id);
    if (!g) {
      g = {
        property_id: o.property_id,
        property_name: o.property_name,
        items: [],
      };
      groups.set(o.property_id, g);
    }
    g.items.push(o);
  }
  // `top` is score-sorted, so insertion order = the group whose best item scores highest
  return [...groups.values()];
}

export function renderDigest(input: {
  workspaceName: string;
  window: DigestWindow;
  items: DigestOpportunity[];
  stillOpen: number;
  publicUrl: string;
}): DigestContent {
  const base = input.publicUrl.replace(/\/$/, '');
  const n = input.items.length;
  const byPriority = PRIORITY_ORDER.map(
    (p) => `${label(p)} ${input.items.filter((o) => o.priority === p).length}`,
  ).join(', ');
  const properties = new Set(input.items.map((o) => o.property_id)).size;
  const groups = groupForDigest(input.items);
  const listed = groups.reduce((sum, g) => sum + g.items.length, 0);

  const paragraphs: string[] = [
    `New opportunities Spider found in ${oneLine(input.workspaceName)} this past week.`,
    [
      `Period: ${day(input.window.since)} → ${day(input.window.until)}`,
      `New opportunities: ${n} (${byPriority})`,
      `Still open in the inbox: ${input.stillOpen}`,
      `Properties affected: ${properties}`,
    ].join('\n'),
  ];
  let rank = 0;
  for (const g of groups) {
    paragraphs.push(`${oneLine(g.property_name)} · ${g.items.length} new`);
    for (const o of g.items) {
      rank += 1;
      const signal = keySignal(o.reason);
      paragraphs.push(
        [
          `${rank}. ${oneLine(o.title)}`,
          `${label(o.priority)} priority${signal ? ` · ${signal}` : ''}`,
          `${base}/opportunities/${o.id}`,
        ].join('\n'),
      );
    }
  }
  if (listed < n) {
    paragraphs.push(
      `Showing the top ${listed} of ${n} new opportunities by score. The Opportunity Inbox lists all of them.`,
    );
  }
  paragraphs.push(
    [
      `Opportunity Inbox → ${base}/opportunities`,
      `Email preferences → ${base}/settings#email-preferences`,
    ].join('\n'),
    'You receive this weekly email as a workspace admin. Turn it off in Settings → General → Weekly opportunities email.',
  );
  return {
    subject: `Spider weekly: ${n} new ${n === 1 ? 'opportunity' : 'opportunities'}`,
    text: paragraphs.join('\n\n'),
    count: n,
    listed,
  };
}

export const DIGEST_TIME_ZONE = 'Europe/Paris';

/** ISO week (2026-W48) of `now` on the Paris calendar, the idempotency key of a send. */
export function digestWeekKey(now: Date): string {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Preview sample (EMAIL_SAMPLES, `npm run mail:preview`): the real renderer on fixed data. */
export function digestSample(origin: string): {
  subject: string;
  text: string;
} {
  const at = (iso: string) => new Date(iso);
  const row = (
    id: number,
    property_id: number,
    property_name: string,
    title: string,
    priority: OpportunityPriority,
    score: number,
    reason: string,
  ): DigestOpportunity => ({
    id,
    workspace_id: 1,
    property_id,
    property_name,
    title,
    priority,
    score,
    status: 'open',
    reason,
    first_seen_at: at('2026-11-20T07:30:00Z'),
  });
  const { subject, text } = renderDigest({
    workspaceName: 'MISSIRIA',
    window: {
      since: at('2026-11-16T07:00:00Z'),
      until: at('2026-11-23T07:00:00Z'),
    },
    items: [
      row(
        41,
        3,
        'example.com',
        'Clicks dropped on example.com',
        'high',
        92,
        'Clicks fell 38% versus the previous 28 days (threshold 25%, min 100 previous clicks). This is a measured change, not a diagnosed cause.',
      ),
      row(
        42,
        3,
        'example.com',
        'Possible cannibalization: "iptv europe"',
        'medium',
        64,
        'Two pages share the clicks of this query over the last 28 days. Consolidating usually helps.',
      ),
      row(
        43,
        4,
        'shop.example.org',
        '12 sitemap URLs are not indexed',
        'high',
        81,
        '12 URLs are listed in the sitemaps, but Google\'s URL Inspection (latest 2026-11-21) reports: "Crawled - currently not indexed".',
      ),
      row(
        44,
        4,
        'shop.example.org',
        'Low CTR on /pricing',
        'low',
        30,
        'Ranks in the top 5 but converts under 2% of impressions into clicks (min 500 impressions).',
      ),
    ],
    stillOpen: 37,
    publicUrl: origin,
  });
  return { subject, text };
}
