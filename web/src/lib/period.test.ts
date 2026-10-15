import { describe, expect, it } from "vitest";
import { isValidCustom, periodFromConfig, periodParams } from "./period";

describe("period", () => {
  it("maps presets and custom ranges to API params", () => {
    expect(periodParams({ kind: "preset", days: 7 })).toEqual({ days: 7 });
    expect(periodParams({ kind: "custom", start: "2026-09-01", end: "2026-09-07" })).toEqual({ start: "2026-09-01", end: "2026-09-07" });
  });
  it("validates custom ranges", () => {
    expect(isValidCustom("2026-09-01", "2026-09-07")).toBe(true);
    expect(isValidCustom("2026-09-08", "2026-09-07")).toBe(false);
    expect(isValidCustom("nope", "2026-09-07")).toBe(false);
  });
  it("restores from a saved view config, defaulting safely", () => {
    expect(periodFromConfig({ days: 90 })).toEqual({ kind: "preset", days: 90 });
    expect(periodFromConfig({ start: "2026-09-01", end: "2026-09-07" })).toEqual({ kind: "custom", start: "2026-09-01", end: "2026-09-07" });
    expect(periodFromConfig({ days: 9999 })).toEqual({ kind: "preset", days: 28 });
    expect(periodFromConfig(null)).toEqual({ kind: "preset", days: 28 });
  });
});
