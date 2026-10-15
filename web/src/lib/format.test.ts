import { describe, expect, it } from "vitest";
import { deltaTone, formatDelta, formatInt, formatPct, formatPosition } from "./format";

describe("format", () => {
  it("formats the 2026-10-15 fleet deltas like the hand-made table", () => {
    expect(formatDelta((545 - 436) / 436)).toBe("+25%");
    expect(formatDelta((461 - 109) / 109)).toBe("+323%");
    expect(formatDelta((238 - 366) / 366)).toBe("-35%");
    expect(formatDelta((144 - 200) / 200)).toBe("-28%");
    expect(formatDelta(null)).toBe("—");
  });

  it("formats integers, percentages and positions", () => {
    expect(formatInt(8741)).toBe("8,741");
    expect(formatPct(0.0271)).toBe("2.71%");
    expect(formatPosition(9.84)).toBe("9.8");
    expect(formatPosition(0)).toBe("—");
  });

  it("colours position deltas with lower-is-better semantics", () => {
    expect(deltaTone(0.25)).toBe("up");
    expect(deltaTone(-0.25)).toBe("down");
    expect(deltaTone(-0.25, true)).toBe("up");
    expect(deltaTone(0.001)).toBe("flat");
    expect(deltaTone(null)).toBe("flat");
  });
});
