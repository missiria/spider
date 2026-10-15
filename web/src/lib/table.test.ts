import { describe, expect, it } from "vitest";
import { applyTableState, DEFAULT_TABLE_STATE, toggleSort } from "./table";
import type { PropertyKpi } from "./types";

const row = (name: string, clicks: number, prevClicks: number, position: number, status: PropertyKpi["status"] = "connected"): PropertyKpi => ({
  id: name.length,
  site_url: `https://www.${name}/`,
  display_name: name,
  status,
  data_since: "2026-01-01",
  last_sync_at: null,
  current: { clicks, impressions: clicks * 10, ctr: 0.1, position },
  previous: { clicks: prevClicks, impressions: prevClicks * 10, ctr: 0.1, position },
  delta: {
    clicks: prevClicks ? (clicks - prevClicks) / prevClicks : null,
    impressions: prevClicks ? (clicks - prevClicks) / prevClicks : null,
    ctr: 0,
    position: 0,
  },
});

const rows = [
  row("iptv-premium-europe.com", 2419, 2581, 7.2),
  row("iptv-shark.com", 1714, 816, 7.6),
  row("iptv-smarters-x.com", 1, 0, 63.6),
  row("example-not-shared.com", 0, 0, 0, "pending"),
];

describe("fleet table state", () => {
  it("defaults to clicks descending", () => {
    expect(applyTableState(rows, DEFAULT_TABLE_STATE).map((r) => r.display_name)).toEqual([
      "iptv-premium-europe.com",
      "iptv-shark.com",
      "iptv-smarters-x.com",
      "example-not-shared.com",
    ]);
  });

  it("sorts by delta with missing deltas last in both directions", () => {
    const desc = applyTableState(rows, { ...DEFAULT_TABLE_STATE, sortKey: "clicks_delta", sortDir: "desc" });
    expect(desc[0].display_name).toBe("iptv-shark.com"); // +110%
    expect(desc.slice(-2).map((r) => r.delta.clicks)).toEqual([null, null]);
    const asc = applyTableState(rows, { ...DEFAULT_TABLE_STATE, sortKey: "clicks_delta", sortDir: "asc" });
    expect(asc[0].display_name).toBe("iptv-premium-europe.com"); // -6%
    expect(asc.slice(-2).map((r) => r.delta.clicks)).toEqual([null, null]);
  });

  it("position ascending puts best position first and empty positions last", () => {
    const sorted = applyTableState(rows, { ...DEFAULT_TABLE_STATE, sortKey: "position", sortDir: "asc" });
    expect(sorted.map((r) => r.current.position)).toEqual([7.2, 7.6, 63.6, 0]);
  });

  it("toggleSort picks the natural direction first, then flips", () => {
    const s1 = toggleSort(DEFAULT_TABLE_STATE, "position");
    expect(s1.sortDir).toBe("asc");
    expect(toggleSort(s1, "position").sortDir).toBe("desc");
    expect(toggleSort(DEFAULT_TABLE_STATE, "impressions").sortDir).toBe("desc");
  });

  it("filters by search, status and empty rows", () => {
    expect(applyTableState(rows, { ...DEFAULT_TABLE_STATE, search: "shark" })).toHaveLength(1);
    expect(applyTableState(rows, { ...DEFAULT_TABLE_STATE, status: "pending" })).toHaveLength(1);
    expect(applyTableState(rows, { ...DEFAULT_TABLE_STATE, hideEmpty: true })).toHaveLength(3);
  });
});
