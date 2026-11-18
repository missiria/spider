import { createHash } from 'node:crypto';

/**
 * How Spider reads a Page indexing reason (ADR-0009):
 *  - likely_defect : usually a fault on the site; can raise opportunities
 *  - intentional   : the normal result of a correct setup (canonical, noindex, redirect, robots)
 *  - review        : unknown or ambiguous reason; shown, raises only a "new reason" alert
 *
 * Google's wording is the key. A reason not listed here is still stored and displayed with
 * its exact text; it just gets `review`. Matching ignores case, quotes and punctuation, so
 * small wording changes ("‘noindex’" vs "'noindex'") still match.
 */
export type ReasonIntent = 'likely_defect' | 'intentional' | 'review';

const KNOWN: { match: RegExp; intent: ReasonIntent }[] = [
  { match: /^not found 404$/, intent: 'likely_defect' },
  { match: /^server error 5xx$/, intent: 'likely_defect' },
  { match: /^soft 404$/, intent: 'likely_defect' },
  { match: /^redirect error$/, intent: 'likely_defect' },
  {
    match: /^blocked due to unauthorized request 401$/,
    intent: 'likely_defect',
  },
  { match: /^blocked due to access forbidden 403$/, intent: 'likely_defect' },
  { match: /^blocked due to other 4xx issue$/, intent: 'likely_defect' },
  {
    match: /^duplicate google chose different canonical than user$/,
    intent: 'likely_defect',
  },
  { match: /^crawled currently not indexed$/, intent: 'likely_defect' },
  { match: /^discovered currently not indexed$/, intent: 'likely_defect' },
  { match: /^indexed though blocked by robots txt$/, intent: 'likely_defect' },
  { match: /^page indexed without content$/, intent: 'likely_defect' },
  {
    match: /^alternate page with proper canonical tag$/,
    intent: 'intentional',
  },
  { match: /^excluded by noindex tag$/, intent: 'intentional' },
  { match: /^page with redirect$/, intent: 'intentional' },
  { match: /^blocked by robots txt$/, intent: 'intentional' },
  {
    match: /^blocked by page removal tool$/,
    intent: 'intentional',
  },
  {
    match: /^duplicate without user selected canonical$/,
    intent: 'review',
  },
];

/** Lower-case, strip accents/quotes/punctuation, collapse spaces. */
export function normalizeReason(reason: string): string {
  return reason
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’'"“”`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function reasonIntent(reason: string): ReasonIntent {
  const n = normalizeReason(reason);
  return KNOWN.find((k) => k.match.test(n))?.intent ?? 'review';
}

/** Stable key for a reason across imports (Google's text, normalised). */
export function reasonHash(reason: string): string {
  return md5(normalizeReason(reason));
}

export function scopeHash(scope: string, detail: string | null): string {
  return md5(`${scope}|${detail ?? ''}`);
}

export function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

/** Search Console deep links (ADR-0009: validation and live tests stay in Search Console). */
export function gscReportLink(siteUrl: string): string {
  return `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(siteUrl)}`;
}

export function gscInspectLink(siteUrl: string, url: string): string {
  return `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(siteUrl)}&id=${encodeURIComponent(url)}`;
}

/** coverageState values of an indexed URL (URL Inspection API wording). */
export function isIndexedCoverage(state: string | null | undefined): boolean {
  if (!state) return false;
  const n = normalizeReason(state);
  return (
    n === 'submitted and indexed' ||
    n === 'indexed not submitted in sitemap' ||
    n.startsWith('indexed')
  );
}
