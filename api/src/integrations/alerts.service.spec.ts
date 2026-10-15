import { matches, mergeAlertConfig } from './alerts.service';

const cand = (over: Partial<Parameters<typeof matches>[1]>) => ({
  dedupeKey: 'x',
  kind: 'opportunity' as const,
  title: 't',
  propertyId: 4,
  payload: {},
  priority: 'high',
  rule: 'clicks_drop',
  ...over,
});

describe('alert matching', () => {
  it('defaults to high-priority opportunities, sync failures and revocations', () => {
    const cfg = mergeAlertConfig({});
    expect(matches(cfg, cand({}))).toBe(true);
    expect(matches(cfg, cand({ priority: 'medium' }))).toBe(false);
    expect(matches(cfg, cand({ kind: 'sync_failed' }))).toBe(true);
    expect(matches(cfg, cand({ kind: 'property_revoked' }))).toBe(true);
  });

  it('honours property, rule and priority filters', () => {
    const cfg = mergeAlertConfig({
      opportunity_priorities: ['high', 'medium'],
      opportunity_rules: ['low_ctr'],
      property_ids: [4],
      sync_failed: false,
    });
    expect(matches(cfg, cand({ rule: 'low_ctr', priority: 'medium' }))).toBe(
      true,
    );
    expect(matches(cfg, cand({ rule: 'clicks_drop' }))).toBe(false);
    expect(matches(cfg, cand({ propertyId: 5, rule: 'low_ctr' }))).toBe(false);
    expect(matches(cfg, cand({ kind: 'sync_failed' }))).toBe(false);
  });

  it('ignores junk in config', () => {
    const cfg = mergeAlertConfig({
      opportunity_priorities: ['urgent', 'low'],
      property_ids: ['x', 3],
      sync_failed: 'yes',
    });
    expect(cfg.opportunity_priorities).toEqual(['low']);
    expect(cfg.property_ids).toEqual([3]);
    expect(cfg.sync_failed).toBe(true);
  });
});
