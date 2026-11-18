/**
 * Page indexing rules (MITP-0833, ADR-0009). Pure, like rules.engine.ts.
 *
 * Inputs are the property's recent "All known pages" imports (Search Console export) and the
 * latest URL Inspection result of its sitemap URLs. Only reasons classified `likely_defect`
 * (and `review` for the new-reason alert) can produce findings: intentional exclusions such as
 * canonical alternates, noindex or redirects are never reported as defects.
 */
import { ReasonIntent } from '../indexing/reasons';
import { Finding } from './rules.engine';
import { RuleConfig } from './rules.config';

export interface IndexingScanReason {
  reason: string;
  reason_hash: string;
  pages: number;
  source: string | null;
  intent: ReasonIntent;
}

export interface IndexingScanInput {
  site_url: string;
  /** newest first, All known pages scope */
  imports: { id: number; report_date: string; reasons: IndexingScanReason[] }[];
  latestTotals: {
    date: string;
    indexed: number | null;
    not_indexed: number | null;
  } | null;
  previousTotals: {
    date: string;
    indexed: number | null;
    not_indexed: number | null;
  } | null;
  /** sitemap URLs whose latest inspection says they are not indexed */
  sitemapUrls: {
    url: string;
    coverage_state: string | null;
    inspected_at: Date;
    verdict: string | null;
    sitemap: string | null;
  }[];
  /** example URLs from the latest issue export of each reason */
  examples: Map<
    string,
    { urls: string[]; partial: boolean; report_date: string }
  >;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const reportLink = (site: string) =>
  `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(site)}`;
const ACTION: Record<string, string> = {
  'not found 404':
    'Open the affected URLs: restore the page, 301-redirect it to its best replacement, or remove internal links and sitemap entries pointing to it. Then click "Validate fix" in Search Console.',
  'server error 5xx':
    'Check server and CDN logs for the affected URLs at Googlebot crawl times (timeouts, PHP errors, rate limits). Fix, then "Validate fix" in Search Console.',
  'soft 404':
    'The pages return 200 but look empty or like an error to Google. Add real content, or return 404/410, or redirect to a relevant page.',
  'redirect error':
    'Look for redirect loops, chains longer than 5 hops, or redirects to an invalid URL; point each URL to its final destination in one hop.',
  'crawled currently not indexed':
    'Google crawled the pages but chose not to index them: improve uniqueness and usefulness, add internal links from indexed pages, and remove thin or duplicate pages from the sitemap.',
  'discovered currently not indexed':
    'Google knows the URLs but has not crawled them: strengthen internal linking, keep them in the sitemap, and check server capacity and crawl budget.',
  'duplicate google chose different canonical than user':
    'Google picked another canonical. Make the canonical tag, internal links, sitemap and redirects all point to the same preferred URL, or accept Google’s choice.',
};
function actionFor(reason: string): string {
  const n = reason
    .toLowerCase()
    .replace(/[‘’'"“”`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return (
    ACTION[n] ??
    'Open this reason in Search Console, check a few example URLs with URL Inspection, fix the cause on the site, then start "Validate fix".'
  );
}

export function evaluateIndexing(
  input: IndexingScanInput,
  cfg: RuleConfig,
): Finding[] {
  const out: Finding[] = [];
  const [latest, previous] = input.imports;
  const evidenceBase = (r?: IndexingScanReason) => ({
    source: 'gsc_export',
    scope: 'all_known',
    report_date: latest?.report_date ?? null,
    previous_report_date: previous?.report_date ?? null,
    import_id: latest?.id ?? null,
    links: { search_console: reportLink(input.site_url) },
    ...(r
      ? {
          reason: r.reason,
          reason_source: r.source,
          intent: r.intent,
          examples: input.examples.get(r.reason_hash)?.urls ?? [],
          examples_partial: input.examples.get(r.reason_hash)?.partial ?? null,
          examples_report_date:
            input.examples.get(r.reason_hash)?.report_date ?? null,
        }
      : {}),
  });

  if (latest) {
    for (const r of latest.reasons) {
      if (r.intent === 'intentional') continue;
      const before = previous?.reasons.find(
        (x) => x.reason_hash === r.reason_hash,
      );

      // new reason (needs a previous import to compare with)
      const nr = cfg.indexing_new_reason;
      if (nr.enabled && previous && !before && r.pages >= nr.min_pages) {
        out.push({
          rule: 'indexing_new_reason',
          subject: 'property',
          key_text: r.reason,
          score: clamp(
            (r.intent === 'likely_defect' ? 55 : 35) +
              Math.log10(r.pages + 1) * 15,
          ),
          confidence: r.intent === 'likely_defect' ? 'high' : 'medium',
          title: `New indexing issue: ${r.reason} (${r.pages} pages)`,
          reason: `"${r.reason}" appears in the Page indexing report of ${latest.report_date} with ${r.pages} pages; it was not in the report of ${previous.report_date}.${r.intent === 'review' ? ' Spider does not know this reason yet: check whether it is intended.' : ''}`,
          suggested_action: actionFor(r.reason),
          evidence: { ...evidenceBase(r), pages: r.pages, previous_pages: 0 },
        });
        continue;
      }

      if (r.intent !== 'likely_defect') continue;

      // spike
      const sp = cfg.indexing_spike;
      if (sp.enabled && before) {
        const delta = r.pages - before.pages;
        const ratio = before.pages ? delta / before.pages : Infinity;
        if (delta >= sp.min_increase_pages && ratio >= sp.min_increase_ratio) {
          out.push({
            rule: 'indexing_spike',
            subject: 'property',
            key_text: r.reason,
            score: clamp(
              45 + Math.min(40, ratio * 20) + Math.log10(delta + 1) * 5,
            ),
            confidence: 'high',
            title: `Indexing issue growing: ${r.reason} ${before.pages} → ${r.pages} pages`,
            reason: `"${r.reason}" went from ${before.pages} pages (${previous.report_date}) to ${r.pages} (${latest.report_date}), +${Number.isFinite(ratio) ? Math.round(ratio * 100) : '∞'}%.`,
            suggested_action: actionFor(r.reason),
            evidence: {
              ...evidenceBase(r),
              pages: r.pages,
              previous_pages: before.pages,
              delta,
            },
          });
        }
      }

      // persistent
      const ps = cfg.indexing_persistent;
      if (
        ps.enabled &&
        r.pages >= ps.min_pages &&
        input.imports.length >= ps.min_imports
      ) {
        const streak = input.imports.slice(0, ps.min_imports);
        if (
          streak.every((imp) =>
            imp.reasons.some(
              (x) => x.reason_hash === r.reason_hash && x.pages >= ps.min_pages,
            ),
          )
        ) {
          out.push({
            rule: 'indexing_persistent',
            subject: 'property',
            key_text: r.reason,
            score: clamp(40 + Math.log10(r.pages + 1) * 15),
            confidence: 'medium',
            title: `Indexing issue not fixed: ${r.reason} (${r.pages} pages)`,
            reason: `"${r.reason}" is present in the last ${ps.min_imports} Page indexing imports (since ${streak[streak.length - 1].report_date}).`,
            suggested_action: actionFor(r.reason),
            evidence: {
              ...evidenceBase(r),
              pages: r.pages,
              history: streak.map((imp) => ({
                report_date: imp.report_date,
                pages:
                  imp.reasons.find((x) => x.reason_hash === r.reason_hash)
                    ?.pages ?? 0,
              })),
            },
          });
        }
      }
    }
  }

  // indexed pages drop (report totals)
  const dr = cfg.indexed_drop;
  const a = input.latestTotals?.indexed;
  const b = input.previousTotals?.indexed;
  if (dr.enabled && a != null && b != null && b >= dr.min_previous_indexed) {
    const ratio = (b - a) / b;
    if (ratio >= dr.drop_ratio) {
      out.push({
        rule: 'indexed_drop',
        subject: 'property',
        key_text: 'indexed_pages',
        score: clamp(50 + ratio * 100),
        confidence: 'high',
        title: `Indexed pages down ${Math.round(ratio * 100)}%: ${b} → ${a}`,
        reason: `Search Console reports ${a} indexed pages on ${input.latestTotals?.date} against ${b} on ${input.previousTotals?.date}.`,
        suggested_action:
          'Compare the reasons table with the previous import to see where the pages went (often 404, noindex, canonical or redirect changes after a release), and check recent deploys.',
        evidence: {
          ...evidenceBase(),
          indexed: a,
          previous_indexed: b,
          drop_ratio: ratio,
        },
      });
    }
  }

  // submitted (sitemap) URLs that Google does not index, per URL Inspection: one finding per
  // coverage state, not one per URL, so twenty properties do not flood the inbox
  const sn = cfg.submitted_not_indexed;
  if (sn.enabled) {
    const byState = new Map<string, typeof input.sitemapUrls>();
    for (const u of input.sitemapUrls) {
      const state = u.coverage_state ?? 'No coverage state';
      byState.set(state, [...(byState.get(state) ?? []), u]);
    }
    for (const [state, urls] of byState) {
      if (urls.length < sn.min_urls) continue;
      const failed = urls.some((u) => u.verdict === 'FAIL');
      const latest = urls.reduce(
        (m, u) => Math.max(m, new Date(u.inspected_at).getTime()),
        0,
      );
      const sitemaps = [
        ...new Set(urls.map((u) => u.sitemap).filter((x): x is string => !!x)),
      ];
      out.push({
        rule: 'submitted_not_indexed',
        subject: 'property',
        key_text: `Sitemap URLs · ${state}`,
        score: clamp(
          (failed ? 55 : 40) + Math.min(30, Math.log10(urls.length + 1) * 15),
        ),
        confidence: 'medium',
        title: `${urls.length} sitemap URL${urls.length === 1 ? '' : 's'} not indexed: ${state}`,
        reason: `${urls.length} URL${urls.length === 1 ? ' is' : 's are'} listed in ${sitemaps.length === 1 ? sitemaps[0] : 'the sitemaps'}, but Google's URL Inspection (latest ${new Date(latest).toISOString().slice(0, 10)}) reports: "${state}".`,
        suggested_action:
          actionFor(state) ===
          'Open this reason in Search Console, check a few example URLs with URL Inspection, fix the cause on the site, then start "Validate fix".'
            ? 'Decide whether these URLs should be indexed. If yes, fix the reason shown and request indexing in Search Console; if not, remove them from the sitemap.'
            : actionFor(state),
        evidence: {
          source: 'url_inspection_api',
          coverage_state: state,
          pages: urls.length,
          examples: urls.slice(0, 10).map((u) => u.url),
          examples_partial: urls.length > 10,
          sitemaps: sitemaps.slice(0, 5),
          inspected_at: new Date(latest),
          links: { search_console: reportLink(input.site_url) },
        },
      });
    }
  }
  return out;
}
