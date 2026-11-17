import { describe, expect, it } from "vitest";
import type { OpportunityDetail, OpportunityRule } from "../types";
import { mdTable } from "./evidence";
import {
  buildOpportunityPrompt,
  googleQueryUrl,
  PROMPT_LANGS,
  PROMPT_VARIANTS,
  propertyDomain,
} from "./index";

const period = { start: "2026-10-18", end: "2026-11-14" };
const previous = { start: "2026-09-20", end: "2026-10-17" };
const property = {
  display_name: "IPTV Shark",
  site_url: "https://www.iptv-shark.com/",
};
const users = new Map([[7, "Amine"]]);
const base = { users, origin: "https://spider.missiria.dev" };

function opp(over: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: 42,
    property_id: 3,
    rule: "cannibalization",
    subject: "query",
    key_text: "tivimate premium",
    status: "open",
    priority: "high",
    score: 62,
    confidence: "low",
    title: 'Possible cannibalization: 2 pages share "tivimate premium"',
    reason: "2 URLs each take at least 25% of the 1840 impressions.",
    suggested_action: "Decide which URL should rank.",
    evidence: {
      period,
      previous,
      query_impressions: 1840,
      competing: [
        {
          page: "https://www.iptv-shark.com/tivimate-premium/",
          clicks: 31,
          impressions: 1104,
          share: 0.6,
          position: 6.42,
        },
        {
          page: "https://www.iptv-shark.com/blog/tivimate|guide/",
          clicks: 4,
          impressions: 736,
          share: 0.4,
          position: 11.07,
        },
      ],
      threshold: { enabled: true, min_impressions: 100, min_share: 0.25 },
    },
    assignee_id: 7,
    due_date: "2026-11-30",
    completed_at: null,
    dismissed_at: null,
    first_seen_at: "2026-11-10T04:00:00.000Z",
    last_seen_at: "2026-11-17T04:00:00.000Z",
    events: [
      {
        id: 1,
        user_id: null,
        type: "created",
        payload: { score: 62 },
        created_at: "2026-11-10T04:00:00.000Z",
      },
      {
        id: 2,
        user_id: 7,
        type: "note",
        payload: { text: "first" },
        created_at: "2026-11-11T09:00:00.000Z",
      },
      {
        id: 3,
        user_id: 7,
        type: "note",
        payload: { text: "second" },
        created_at: "2026-11-12T09:00:00.000Z",
      },
      {
        id: 4,
        user_id: 7,
        type: "note",
        payload: { text: "third\nline" },
        created_at: "2026-11-13T09:00:00.000Z",
      },
      {
        id: 5,
        user_id: 9,
        type: "note",
        payload: { text: "fourth" },
        created_at: "2026-11-14T09:00:00.000Z",
      },
    ],
    impact: null,
    ...over,
  };
}

describe("buildOpportunityPrompt", () => {
  it("carries everything the cannibalization screen shows", () => {
    const text = buildOpportunityPrompt(opp(), property, {
      ...base,
      variant: "explain",
      lang: "en",
    });
    expect(text).toMatch(/^You are a senior SEO analyst\. Explain/);
    expect(text).toContain("- Property: IPTV Shark (www.iptv-shark.com)");
    expect(text).toContain("- Rule: Cannibalization");
    expect(text).toContain('- Query: "tivimate premium"');
    expect(text).toContain("- Priority: High");
    expect(text).toContain("- Status: Open");
    expect(text).toContain("- Confidence: Low (heuristic");
    expect(text).toContain("- Score: 62/100");
    expect(text).toContain(
      "2 URLs each take at least 25% of the 1840 impressions.",
    );
    expect(text).toContain("Decide which URL should rank.");
    expect(text).toContain(
      "- Period: 2026-10-18 → 2026-11-14 (compared with 2026-09-20 → 2026-10-17)",
    );
    expect(text).toContain("(1,840 impressions in total)");
    expect(text).toContain(
      "| https://www.iptv-shark.com/tivimate-premium/ | 60% | 31 | 1,104 | 6.4 |",
    );
    // a pipe inside a URL must not break the table
    expect(text).toContain("tivimate\\|guide/ | 40% | 4 | 736 | 11.1 |");
    expect(text).toContain(
      '- Threshold used: `{"enabled":true,"min_impressions":100,"min_share":0.25}`',
    );
    expect(text).toContain("- First seen: 2026-11-10");
    expect(text).toContain("- Last seen: 2026-11-17");
    expect(text).toContain("- Assignee: Amine");
    expect(text).toContain("- Due date: 2026-11-30");
    expect(text).toContain(
      "- Spider opportunity: https://spider.missiria.dev/opportunities/42",
    );
    expect(text).toContain(
      `https://www.google.com/search?q=${encodeURIComponent('site:www.iptv-shark.com "tivimate premium"')}`,
    );
    expect(text).toContain("consolidate (301 or canonical)");
    expect(text).toContain("What to re-measure in Search Console, and when.");
  });

  it("keeps the three latest notes, newest first, on one line each", () => {
    const text = buildOpportunityPrompt(opp(), property, {
      ...base,
      variant: "explain",
      lang: "en",
    });
    expect(text).not.toContain("first");
    const notes = text.split("\n").filter((l) => l.startsWith("  - "));
    expect(notes).toEqual([
      "  - 2026-11-14, user #9: fourth",
      "  - 2026-11-13, Amine: third line",
      "  - 2026-11-12, Amine: second",
    ]);
  });

  it("prints near-page-one metrics as a table", () => {
    const text = buildOpportunityPrompt(
      opp({
        rule: "near_page_one",
        title: "Near page one",
        evidence: {
          period,
          previous,
          current: {
            key: "iptv test",
            clicks: 12,
            impressions: 2300,
            ctr: 0.0052,
            position: 11.34,
          },
          threshold: {
            enabled: true,
            min_position: 8,
            max_position: 20,
            min_impressions: 50,
          },
        },
      }),
      property,
      { ...base, variant: "explain", lang: "en" },
    );
    expect(text).toContain("- Rule: Near page one");
    expect(text).toContain("| Metric | Current period |");
    expect(text).toContain("| Clicks | 12 |");
    expect(text).toContain("| Impressions | 2,300 |");
    expect(text).toContain("| CTR | 0.52% |");
    expect(text).toContain("| Average position | 11.3 |");
    expect(text).toContain("Core Web Vitals");
    expect(text).not.toContain("Previous period");
  });

  it("shows previous metrics, and no invented dates, for drop rules", () => {
    const text = buildOpportunityPrompt(
      opp({
        rule: "clicks_drop",
        subject: "page",
        key_text: "https://www.iptv-shark.com/essai/",
        evidence: {
          period,
          previous: { clicks: 240, impressions: 9100 },
          current: { clicks: 120, impressions: 8800 },
          drop: 0.5,
          threshold: {
            enabled: true,
            min_previous_clicks: 20,
            drop_ratio: 0.3,
          },
        },
      }),
      property,
      { ...base, variant: "explain", lang: "en" },
    );
    expect(text).toContain("- Period: 2026-10-18 → 2026-11-14\n");
    expect(text).not.toContain("compared with");
    expect(text).toContain("| Metric | Current period | Previous period |");
    expect(text).toContain("| Clicks | 120 | 240 |");
    expect(text).toContain("| Impressions | 8,800 | 9,100 |");
    expect(text).not.toContain("| CTR");
    expect(text).toContain("- Drop: 50%");
    expect(text).toContain("- Page: https://www.iptv-shark.com/essai/");
    expect(text).not.toContain("google.com/search");
    expect(text).toContain("seasonality");
  });

  it("prints low-CTR potential and whole-property scope", () => {
    const low = buildOpportunityPrompt(
      opp({
        rule: "low_ctr",
        evidence: {
          period,
          previous,
          current: {
            key: "x",
            clicks: 3,
            impressions: 900,
            ctr: 0.0033,
            position: 4.2,
          },
          potential_clicks: 24,
        },
      }),
      property,
      { ...base, variant: "explain", lang: "en" },
    );
    expect(low).toContain("about 24 extra clicks per period if CTR reached 3%");
    expect(low).not.toContain("Threshold used");
    const whole = buildOpportunityPrompt(
      opp({ rule: "impressions_drop", subject: "property", key_text: "" }),
      property,
      { ...base, variant: "explain", lang: "en" },
    );
    expect(whole).toContain("- Scope: Whole property");
    expect(whole).toContain("de-indexed URLs");
  });

  it("falls back to the generic template for an unknown rule", () => {
    const text = buildOpportunityPrompt(
      opp({ rule: "brand_new_rule" as OpportunityRule, evidence: {} }),
      property,
      { ...base, variant: "explain", lang: "en" },
    );
    expect(text).toContain("- Rule: Other (brand_new_rule)");
    expect(text).toContain("No evidence data recorded.");
    expect(text).toContain("What the evidence shows and what it cannot show.");
  });

  it("survives missing optional data", () => {
    const text = buildOpportunityPrompt(
      opp({ assignee_id: null, due_date: null, events: [] }),
      null,
      { variant: "explain", lang: "en" },
    );
    expect(text).not.toContain("- Property:");
    expect(text).not.toContain("Assignee");
    expect(text).not.toContain("Due date");
    expect(text).not.toContain("Latest notes");
    expect(text).not.toContain("## Links");
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("changes the task per variant", () => {
    const ticket = buildOpportunityPrompt(opp(), property, {
      ...base,
      variant: "ticket",
      lang: "en",
    });
    expect(ticket).toContain("ready-to-file work ticket");
    expect(ticket).toContain("Acceptance criteria:");
    const brief = buildOpportunityPrompt(opp(), property, {
      ...base,
      variant: "brief",
      lang: "en",
    });
    expect(brief).toContain("content brief");
    expect(brief).toContain("Recommended title tag, meta description and H1.");
    expect(brief).toContain("Pick the one URL that should own the query");
    expect(brief).not.toContain("consolidate (301 or canonical)");
  });

  it("writes the scaffolding in French and keeps the data", () => {
    const text = buildOpportunityPrompt(opp(), property, {
      ...base,
      variant: "ticket",
      lang: "fr",
    });
    expect(text).toContain("Réponds en français.");
    expect(text).toContain("## Opportunité");
    expect(text).toContain("- Règle: Cannibalisation");
    expect(text).toContain("- Priorité: Haute");
    expect(text).toContain("## Preuves");
    expect(text).toContain(
      "| URL | Part des impressions | Clics | Impressions | Position moyenne |",
    );
    expect(text).toContain("Decide which URL should rank.");
    expect(text).toContain("Critères d’acceptation");
  });

  it("produces a distinct, complete prompt for every rule, variant and language", () => {
    const rules: OpportunityRule[] = [
      "clicks_drop",
      "impressions_drop",
      "low_ctr",
      "near_page_one",
      "cannibalization",
    ];
    const seen = new Set<string>();
    for (const rule of rules)
      for (const variant of PROMPT_VARIANTS)
        for (const lang of PROMPT_LANGS) {
          const text = buildOpportunityPrompt(opp({ rule }), property, {
            ...base,
            variant,
            lang,
          });
          expect(text).toContain(
            "https://spider.missiria.dev/opportunities/42",
          );
          expect(text).not.toMatch(/undefined|\{n\}/);
          seen.add(text);
        }
    expect(seen.size).toBe(rules.length * 3 * 2);
  });

  it("never leaks fields the page does not show", () => {
    const leaky = {
      ...opp(),
      workspace_id: 987654,
      fingerprint: "deadbeefdeadbeefdeadbeefdeadbeef",
    } as OpportunityDetail;
    const text = buildOpportunityPrompt(leaky, property, {
      ...base,
      variant: "explain",
      lang: "en",
    });
    expect(text).not.toContain("987654");
    expect(text).not.toContain("deadbeef");
  });
});

describe("helpers", () => {
  it("reads the domain of both GSC property kinds", () => {
    expect(propertyDomain("https://www.example.com/")).toBe("www.example.com");
    expect(propertyDomain("sc-domain:example.com")).toBe("example.com");
    expect(googleQueryUrl("sc-domain:example.com", "a b")).toBe(
      "https://www.google.com/search?q=site%3Aexample.com%20%22a%20b%22",
    );
  });

  it("builds a Markdown table", () => {
    expect(mdTable(["A", "B"], [["1", "x|y"]])).toBe(
      "| A | B |\n| --- | --- |\n| 1 | x\\|y |",
    );
  });
});
