import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyCell,
  copyText,
  displayCell,
  reportTables,
  toTsv,
} from "./exportTable";
import type { ReportData } from "./types";

const base: ReportData = {
  report_id: 7,
  title: "Monthly",
  scope: "property",
  property: {
    id: 1,
    display_name: "example.com",
    site_url: "https://example.com/",
  },
  generated_at: "2026-10-22T08:00:00.000Z",
  data_through: "2026-10-18",
  period: { start: "2026-09-21", end: "2026-10-18" },
  previousPeriod: { start: "2026-08-24", end: "2026-09-20" },
  notes: null,
  overview: {
    current: { clicks: 1234, impressions: 56789, ctr: 0.0217, position: 4.26 },
    previous: { clicks: 1000, impressions: 50000, ctr: 0.02, position: 5 },
    delta: { clicks: 0.234, impressions: 0.1358, ctr: 0.085, position: -0.148 },
    comparison_available: true,
  },
  tables: [
    {
      section: "queries",
      title: "Top queries",
      keyLabel: "Query",
      note: "query rows explain 55% of clicks",
      rows: [
        {
          key: "iptv\tspain",
          clicks: 120,
          impressions: 4000,
          ctr: 0.03,
          position: 3.24,
        },
        {
          key: '=HYPERLINK("http://evil")',
          clicks: 3,
          impressions: 90,
          ctr: 0.0333,
          position: 8,
        },
        {
          key: "-cheap iptv",
          clicks: 1,
          impressions: 10,
          ctr: 0.1,
          position: 12.5,
        },
      ],
    },
  ],
  opportunities: null,
};

describe("exportTable", () => {
  it("builds tables in PDF order with the CSV section names", () => {
    const t = reportTables(base);
    expect(t.map((x) => [x.section, x.title])).toEqual([
      ["overview", "Overview"],
      ["queries", "Top queries"],
    ]);
    expect(t[1].note).toBe("query rows explain 55% of clicks");
  });

  it("copies the visible table as TSV with headers, paste-friendly numbers and a formula guard", () => {
    const queries = reportTables(base)[1];
    expect(toTsv(queries)).toBe(
      [
        "Query\tClicks\tImpressions\tCTR\tPosition",
        "iptv spain\t120\t4000\t3.00%\t3.2",
        '\'=HYPERLINK("http://evil")\t3\t90\t3.33%\t8.0',
        "'-cheap iptv\t1\t10\t10.00%\t12.5",
      ].join("\n"),
    );
  });

  it("KPI rows keep their own formats on screen and in the copy", () => {
    const overview = reportTables(base)[0];
    expect(
      overview.rows.map((r) =>
        r.map((c, i) => displayCell(c, overview.columns[i].kind)),
      ),
    ).toEqual([
      ["Clicks", "1,234", "1,000", "+23%"],
      ["Impressions", "56,789", "50,000", "+14%"],
      ["CTR", "2.17%", "2.00%", "+9%"],
      ["Avg. position", "4.3", "5.0", "-15%"],
    ]);
    expect(toTsv(overview).split("\n")[1]).toBe("Clicks\t1234\t1000\t23%");
  });

  it("without a stored comparison period previous values and deltas are blank, never zeros", () => {
    const data: ReportData = {
      ...base,
      overview: { ...base.overview!, comparison_available: false },
    };
    const overview = reportTables(data)[0];
    expect(overview.note).toMatch(/previous values and changes are not shown/);
    expect(toTsv(overview).split("\n")[1]).toBe("Clicks\t1234\t\t");
    expect(displayCell(overview.rows[0][2], "int")).toBe("—");
  });

  it("fleet overview lists each property; opportunities carry no internal URLs", () => {
    const fleet: ReportData = {
      ...base,
      scope: "fleet",
      property: null,
      tables: [],
      overview: {
        ...base.overview!,
        properties: [
          {
            id: 1,
            display_name: "a.com",
            current: { clicks: 10, impressions: 100, ctr: 0.1, position: 2 },
            previous: { clicks: 5, impressions: 50, ctr: 0.1, position: 3 },
            delta: { clicks: 1, impressions: 1 },
          },
        ],
      },
      opportunities: [
        {
          id: 9,
          priority: "high",
          title: "Clicks drop",
          property: "a.com",
          confidence: "high",
          rule: "clicks_drop",
        },
      ],
    };
    const t = reportTables(fleet);
    expect(toTsv(t[1])).toBe(
      "Site\tClicks\tClicks (previous)\tΔ clicks\tImpressions\tImpressions (previous)\tΔ impressions\tCTR\tPosition\na.com\t10\t5\t100%\t100\t50\t100%\t10.00%\t2.0",
    );
    expect(toTsv(t[2])).toBe(
      "Priority\tFinding\tProperty\tConfidence\nhigh\tClicks drop\ta.com\thigh",
    );
  });

  it("copyCell handles empty and non-numeric values", () => {
    expect(copyCell(null, "int")).toBe("");
    expect(copyCell("x", "int")).toBe("");
    expect(copyCell(0, "pos")).toBe("");
  });
});

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Clipboard API when it is allowed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("a\tb")).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("a\tb");
  });

  it("falls back to a selection copy when permission is denied", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: exec,
      configurable: true,
    });
    await expect(copyText("x")).resolves.toEqual({ ok: true });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports a readable failure when both ways are blocked", async () => {
    vi.stubGlobal("navigator", {});
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    const r = await copyText("x");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/blocked clipboard access/);
  });
});
