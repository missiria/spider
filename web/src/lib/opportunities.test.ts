import { describe, expect, it } from "vitest";
import { isOverdue, subjectLabel } from "./opportunities";

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
