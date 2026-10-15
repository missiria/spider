import { describe, expect, it } from "vitest";
import { applyTopState, DEFAULT_TOP_STATE, toggleTopSort } from "./topTable";
import type { TopRow } from "./types";

const r = (key: string, clicks: number, impressions: number, position: number): TopRow => ({
  id: key,
  key_text: key,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

const rows = [r("iptv test", 66, 335, 7.8), r("epg", 12, 1477, 7.9), r("iptv shark", 17, 29, 2.6), r("iptv premium", 18, 249, 21.4)];

describe("top table state", () => {
  it("defaults to clicks desc", () => {
    expect(applyTopState(rows, DEFAULT_TOP_STATE).map((x) => x.key_text)).toEqual(["iptv test", "iptv premium", "iptv shark", "epg"]);
  });
  it("position asc puts the best position first", () => {
    const s = toggleTopSort(DEFAULT_TOP_STATE, "position");
    expect(s.sortDir).toBe("asc");
    expect(applyTopState(rows, s)[0].key_text).toBe("iptv shark");
  });
  it("impressions desc, ctr desc, then flip", () => {
    expect(applyTopState(rows, toggleTopSort(DEFAULT_TOP_STATE, "impressions"))[0].key_text).toBe("epg");
    const ctr = toggleTopSort(DEFAULT_TOP_STATE, "ctr");
    expect(applyTopState(rows, ctr)[0].key_text).toBe("iptv shark");
    expect(applyTopState(rows, toggleTopSort(ctr, "ctr"))[0].key_text).toBe("epg");
  });
  it("filters by text and minimum clicks", () => {
    expect(applyTopState(rows, { ...DEFAULT_TOP_STATE, search: "iptv" })).toHaveLength(3);
    expect(applyTopState(rows, { ...DEFAULT_TOP_STATE, minClicks: 18 })).toHaveLength(2);
  });
});
