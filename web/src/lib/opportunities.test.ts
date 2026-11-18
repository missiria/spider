import { describe, expect, it } from "vitest";
import { isOverdue, sanitizeOpportunityFilter, subjectLabel } from "./opportunities";

describe("opportunities helpers", () => {
  it("labels subjects", () => {
    expect(subjectLabel("property", "")).toBe("Whole property");
    expect(subjectLabel("page", "https://www.iptv-shark.com/iptv-essai-gratuit/")).toBe("/iptv-essai-gratuit/");
    expect(subjectLabel("query", "iptv test")).toBe("“iptv test”");
  });
  it("flags overdue only for live items", () => {
    expect(isOverdue("2000-01-01", "open")).toBe(true);
    expect(isOverdue("2000-01-01", "done")).toBe(false);
    expect(isOverdue(null, "open")).toBe(false);
    expect(isOverdue("2999-01-01", "in_progress")).toBe(false);
  });
});

describe("sanitizeOpportunityFilter (MISS-0189)", () => {
  it("keeps a valid filter", () => {
    const f = { status: "open", property_id: 3, rule: "cannibalization", priority: "high", subject: "query", assignee_id: 2 };
    expect(sanitizeOpportunityFilter(f)).toEqual(f);
  });
  it("falls back to the default for junk", () => {
    for (const raw of [null, undefined, "x", 42, [], {}]) expect(sanitizeOpportunityFilter(raw)).toEqual({ status: "active" });
  });
  it("drops unknown keys and values that no longer exist", () => {
    expect(sanitizeOpportunityFilter({ status: "archived", rule: "removed_rule", priority: "urgent", subject: "site", property_id: "3", assignee_id: -1, extra: true })).toEqual({ status: "active" });
    expect(sanitizeOpportunityFilter({ status: "done", rule: "toString" })).toEqual({ status: "done" });
  });
  it("drops a deleted property or assignee once the options are known", () => {
    const f = { status: "open", property_id: 3, assignee_id: 2, rule: "low_ctr" };
    expect(sanitizeOpportunityFilter(f, { propertyIds: [1, 2] })).toEqual({ status: "open", assignee_id: 2, rule: "low_ctr" });
    expect(sanitizeOpportunityFilter(f, { propertyIds: [3], userIds: [9] })).toEqual({ status: "open", property_id: 3, rule: "low_ctr" });
    expect(sanitizeOpportunityFilter(f, { propertyIds: [3], userIds: [2] })).toEqual(f);
  });
});
