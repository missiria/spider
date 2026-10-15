/**
 * Pure rule evaluation (no I/O) so every rule is unit-testable. The service feeds it
 * aggregated rows and persists what comes back.
 */
import { createHash } from 'node:crypto';
import { KeyTotals } from '../metrics/dimension.math';
import { MetricTotals, Period } from '../metrics/metrics.math';
import { OpportunityConfidence, OpportunityPriority, OpportunityRule, OpportunitySubject } from './entities/opportunity.entity';
import { RuleConfig } from './rules.config';

export interface Finding {
  rule: OpportunityRule;
  subject: OpportunitySubject;
  key_text: string;
  score: number; // 0..100
  confidence: OpportunityConfidence;
  title: string;
  reason: string;
  suggested_action: string;
  evidence: Record<string, unknown>;
}

export interface ScanInput {
  period: Period;
  previous: Period;
  property: { current: MetricTotals; previous: MetricTotals };
  pages: { current: KeyTotals[]; previous: KeyTotals[] };
  queries: { current: KeyTotals[]; previous: KeyTotals[] };
  /** query × page rows for the current period (aggregated, from the API) */
  queryPages: { query: string; page: string; clicks: number; impressions: number; position: number }[];
}

export function fingerprint(propertyId: number, f: Pick<Finding, 'rule' | 'subject' | 'key_text'>): string {
  return createHash('md5').update(`${f.rule}|${propertyId}|${f.subject}|${f.key_text}`).digest('hex');
}

export function priorityFromScore(score: number): OpportunityPriority {
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function evaluate(input: ScanInput, cfg: RuleConfig): Finding[] {
  const out: Finding[] = [];
  const base = { period: input.period, previous: input.previous };

  // ---- drops (property + pages) -------------------------------------------
  const dropFindings = (subject: OpportunitySubject, key: string, cur: { clicks: number; impressions: number }, prev: { clicks: number; impressions: number }) => {
    if (cfg.clicks_drop.enabled && prev.clicks >= cfg.clicks_drop.min_previous_clicks) {
      const drop = (prev.clicks - cur.clicks) / prev.clicks;
      if (drop >= cfg.clicks_drop.drop_ratio) {
        const lost = prev.clicks - cur.clicks;
        out.push({
          rule: 'clicks_drop',
          subject,
          key_text: key,
          score: clamp(40 + drop * 40 + Math.min(20, lost / 10)),
          confidence: prev.clicks >= 100 ? 'high' : 'medium',
          title: `Possible clicks drop: −${pct(drop)} (${prev.clicks} → ${cur.clicks})`,
          reason: `Clicks fell ${pct(drop)} versus the previous ${daysIn(input.period)} days (threshold ${pct(cfg.clicks_drop.drop_ratio)}, min ${cfg.clicks_drop.min_previous_clicks} previous clicks). This is a measured change, not a diagnosed cause: seasonality, SERP layout changes or a lost ranking can all look like this.`,
          suggested_action: subject === 'property'
            ? 'Open the property page, sort pages and queries by clicks delta to find where the loss concentrates, then check recent site changes and Search Console messages for that period.'
            : 'Compare this page\'s queries and position over both periods; check the page still returns 200 with the same canonical and title, and whether a competing page or SERP feature took the query.',
          evidence: { ...base, current: cur, previous: prev, drop, threshold: cfg.clicks_drop },
        });
      }
    }
    if (cfg.impressions_drop.enabled && prev.impressions >= cfg.impressions_drop.min_previous_impressions) {
      const drop = (prev.impressions - cur.impressions) / prev.impressions;
      if (drop >= cfg.impressions_drop.drop_ratio) {
        out.push({
          rule: 'impressions_drop',
          subject,
          key_text: key,
          score: clamp(30 + drop * 40 + Math.min(20, (prev.impressions - cur.impressions) / 200)),
          confidence: prev.impressions >= 2000 ? 'high' : 'medium',
          title: `Possible visibility drop: impressions −${pct(drop)} (${prev.impressions} → ${cur.impressions})`,
          reason: `Impressions fell ${pct(drop)} versus the previous window (threshold ${pct(cfg.impressions_drop.drop_ratio)}, min ${cfg.impressions_drop.min_previous_impressions}). Fewer impressions usually means lost rankings or de-indexed URLs; it can also be a query-demand change.`,
          suggested_action: subject === 'property'
            ? 'Check Search Console → Pages for new "not indexed" reasons and the Manual actions / Security tabs; compare top queries by impressions delta.'
            : 'Inspect the URL in Search Console (index status, canonical, last crawl) and compare its queries\' positions over both periods.',
          evidence: { ...base, current: cur, previous: prev, drop, threshold: cfg.impressions_drop },
        });
      }
    }
  };

  dropFindings('property', '', input.property.current, input.property.previous);
  const prevPages = new Map(input.pages.previous.map((p) => [p.key, p]));
  for (const page of input.pages.current) {
    const prev = prevPages.get(page.key);
    if (prev) dropFindings('page', page.key, page, prev);
  }
  // pages that vanished entirely this period
  const curPages = new Set(input.pages.current.map((p) => p.key));
  for (const prev of input.pages.previous) {
    if (!curPages.has(prev.key)) dropFindings('page', prev.key, { clicks: 0, impressions: 0 }, prev);
  }

  // ---- low CTR (pages + queries) -----------------------------------------
  if (cfg.low_ctr.enabled) {
    const lowCtr = (subject: OpportunitySubject, rows: KeyTotals[]) => {
      for (const r of rows) {
        if (r.impressions >= cfg.low_ctr.min_impressions && r.ctr < cfg.low_ctr.max_ctr && r.position > 0 && r.position <= cfg.low_ctr.max_position) {
          const potential = r.impressions * (0.03 - r.ctr); // clicks gained if CTR reached a modest 3 %
          out.push({
            rule: 'low_ctr',
            subject,
            key_text: r.key,
            score: clamp(30 + Math.min(50, potential / 5) + (cfg.low_ctr.max_position - r.position) * 2),
            confidence: r.impressions >= 1000 ? 'high' : 'medium',
            title: `Low CTR at position ${r.position.toFixed(1)}: ${pct(r.ctr)} on ${r.impressions} impressions`,
            reason: `Ranks in the top ${cfg.low_ctr.max_position} but converts under ${pct(cfg.low_ctr.max_ctr)} of impressions into clicks (min ${cfg.low_ctr.min_impressions} impressions). Snippet, title or intent mismatch are the usual reasons; a SERP feature above the result can also absorb clicks.`,
            suggested_action: subject === 'page'
              ? 'Rewrite the title and meta description around the top queries of this page; check which SERP features show for them.'
              : 'Find the page ranking for this query, align its title/snippet with the query wording, and check the result type Google shows.',
            evidence: { ...base, current: r, potential_clicks: Math.round(potential), threshold: cfg.low_ctr },
          });
        }
      }
    };
    lowCtr('page', input.pages.current);
    lowCtr('query', input.queries.current);
  }

  // ---- near page one (queries) -------------------------------------------
  if (cfg.near_page_one.enabled) {
    for (const q of input.queries.current) {
      if (q.impressions >= cfg.near_page_one.min_impressions && q.position >= cfg.near_page_one.min_position && q.position <= cfg.near_page_one.max_position) {
        out.push({
          rule: 'near_page_one',
          subject: 'query',
          key_text: q.key,
          score: clamp(20 + Math.min(40, q.impressions / 25) + (cfg.near_page_one.max_position - q.position) * 2),
          confidence: 'medium',
          title: `Near page one: "${q.key}" at position ${q.position.toFixed(1)} (${q.impressions} impressions)`,
          reason: `Average position between ${cfg.near_page_one.min_position} and ${cfg.near_page_one.max_position} with at least ${cfg.near_page_one.min_impressions} impressions: small gains move it into the first results, where CTR is several times higher.`,
          suggested_action: 'Strengthen the ranking page: cover the query in the H1/intro, add internal links with this wording, refresh the content and check Core Web Vitals.',
          evidence: { ...base, current: q, threshold: cfg.near_page_one },
        });
      }
    }
  }

  // ---- cannibalization (query × page) ------------------------------------
  if (cfg.cannibalization.enabled) {
    const byQuery = new Map<string, ScanInput['queryPages']>();
    for (const row of input.queryPages) {
      const list = byQuery.get(row.query) ?? [];
      list.push(row);
      byQuery.set(row.query, list);
    }
    for (const [query, rows] of byQuery) {
      const total = rows.reduce((n, r) => n + r.impressions, 0);
      if (total < cfg.cannibalization.min_impressions) continue;
      const competing = rows.filter((r) => r.impressions / total >= cfg.cannibalization.min_share).sort((a, b) => b.impressions - a.impressions);
      if (competing.length >= 2) {
        out.push({
          rule: 'cannibalization',
          subject: 'query',
          key_text: query,
          score: clamp(30 + Math.min(40, total / 50) + competing.length * 5),
          confidence: 'low',
          title: `Possible cannibalization: ${competing.length} pages share "${query}"`,
          reason: `${competing.length} URLs each take at least ${pct(cfg.cannibalization.min_share)} of the ${total} impressions for this query. Google alternates between them, which usually caps the best position. Heuristic for human review: intentional variants (languages, product sizes) also look like this.`,
          suggested_action: 'Decide which URL should rank, consolidate or differentiate the others (canonical, internal links, distinct intent), then watch the position over the next window.',
          evidence: { ...base, query_impressions: total, competing: competing.map((r) => ({ page: r.page, clicks: r.clicks, impressions: r.impressions, share: r.impressions / total, position: r.position })), threshold: cfg.cannibalization },
        });
      }
    }
  }

  return out;
}

function daysIn(p: Period): number {
  const a = new Date(`${p.start}T00:00:00Z`).getTime();
  const b = new Date(`${p.end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}
