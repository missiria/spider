import { describe, expect, it, vi } from "vitest";
import { assignmentSummary, buildAssignment, groupScanItems, noNewSummary, pollScan } from "./scanResults";
import type { ScanJob, ScanNewItem, ScanResult } from "./types";

const item = (id: number, priority: ScanNewItem["priority"], rule: ScanNewItem["rule"]): ScanNewItem => ({ id, priority, rule, property_id: 1, subject: "page", key_text: `https://x.test/${id}`, title: `Item ${id}` });

describe("post-scan grouping (MISS-0203)", () => {
  const items = [item(1, "low", "low_ctr"), item(2, "high", "clicks_drop"), item(3, "high", "clicks_drop"), item(4, "high", "indexed_drop"), item(5, "low", "near_page_one"), item(6, "low", "low_ctr")];

  it("groups by the app's priorities, most urgent first, empty ones left out, counts sum to the total", () => {
    const groups = groupScanItems(items);
    expect(groups.map((g) => [g.priority, g.items.length])).toEqual([
      ["high", 3],
      ["low", 3],
    ]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(items.length);
    expect(groups[0].rules).toEqual([
      { rule: "clicks_drop", label: "Clicks drop", count: 2 },
      { rule: "indexed_drop", label: "Indexed pages drop", count: 1 },
    ]);
  });

  it("only groups with a member chosen are sent; their ids are exactly the group's", () => {
    const groups = groupScanItems(items);
    expect(buildAssignment(groups, {})).toEqual([]);
    expect(buildAssignment(groups, { low: 7 })).toEqual([{ assignee_id: 7, ids: [1, 5, 6] }]);
  });

  it("summaries name conflicts and closed items apart", () => {
    expect(assignmentSummary({ assigned: [{ id: 1, assignee_id: 2 }], unchanged: [], conflicts: [], skipped: [] })).toBe("1 opportunity assigned");
    expect(assignmentSummary({ assigned: [{ id: 1, assignee_id: 2 }], unchanged: [{ id: 3, assignee_id: 2 }], conflicts: [{ id: 4, assignee_id: 9 }], skipped: [{ id: 5, reason: "closed" }] })).toBe("2 opportunities assigned · 1 already assigned by someone else (kept) · 1 closed or removed since the scan");
    expect(noNewSummary({ properties: 1, updated: 4, reopened: 1 })).toBe("Scan complete: no new opportunities across 1 property · 4 refreshed · 1 reopened");
  });
});

describe("pollScan (MISS-0203)", () => {
  const result = { scan_id: "s1", created: 1, new_items: [] } as unknown as ScanResult;
  const job = (status: ScanJob["status"], extra: Partial<ScanJob> = {}): ScanJob => ({ scan_id: "s1", status, started_at: "", finished_at: null, result: null, error: null, ...extra });
  const fast = { intervalMs: 0 };

  it("polls until the scan is done and returns its result", async () => {
    const get = vi.fn().mockResolvedValueOnce(job("running")).mockResolvedValueOnce(job("done", { result }));
    await expect(pollScan(async () => job("running"), get, fast)).resolves.toBe(result);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith("s1");
  });

  it("rejects on a failed scan, never resolves a result", async () => {
    await expect(pollScan(async () => job("running"), async () => job("failed", { error: "GSC down" }), fast)).rejects.toThrow("GSC down");
  });

  it("tolerates a short network blip, gives up after repeated errors", async () => {
    const blip = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce(job("done", { result }));
    await expect(pollScan(async () => job("running"), blip, fast)).resolves.toBe(result);
    const down = vi.fn().mockRejectedValue(new Error("404 lost"));
    await expect(pollScan(async () => job("running"), down, { ...fast, maxErrors: 2 })).rejects.toThrow("404 lost");
    expect(down).toHaveBeenCalledTimes(2);
  });
});
