import { describe, expect, it } from "vitest";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  isPageSize,
  PAGE_SIZES,
  paginate,
} from "./pagination";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("pagination (MISS-0195)", () => {
  it("offers 10 / 50 / 250 and defaults to 10", () => {
    expect([...PAGE_SIZES]).toEqual([10, 50, 250]);
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    expect(isPageSize(50)).toBe(true);
    expect(isPageSize(100)).toBe(false);
    expect(isPageSize("10")).toBe(false);
  });

  it("slices the first page with a 1-based range", () => {
    const p = paginate(rows(312), 1, 10);
    expect(p.rows).toEqual(rows(10));
    expect(p).toMatchObject({
      page: 1,
      pageCount: 32,
      start: 1,
      end: 10,
      total: 312,
    });
  });

  it("returns a short last page", () => {
    const p = paginate(rows(312), 32, 10);
    expect(p.rows).toEqual([311, 312]);
    expect(p).toMatchObject({ start: 311, end: 312 });
    expect(paginate(rows(312), 2, 250)).toMatchObject({
      start: 251,
      end: 312,
      pageCount: 2,
    });
  });

  it("clamps a page past the end when the list shrinks (never a blank page)", () => {
    const p = paginate(rows(23), 9, 10);
    expect(p.page).toBe(3);
    expect(p.rows).toEqual([21, 22, 23]);
    expect(clampPage(0, 23, 10)).toBe(1);
    expect(clampPage(-4, 23, 10)).toBe(1);
    expect(clampPage(Number.NaN, 23, 10)).toBe(1);
  });

  it("handles an empty list", () => {
    expect(paginate([], 4, 50)).toEqual({
      rows: [],
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
      total: 0,
    });
  });

  it("falls back to the default size for an unknown size", () => {
    expect(paginate(rows(30), 1, 7).rows).toHaveLength(10);
  });
});
