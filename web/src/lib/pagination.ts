/** Search Console style paging (MISS-0195): 10 rows by default, 10 / 50 / 250 per page. */
export const PAGE_SIZES = [10, 50, 250] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

export function isPageSize(n: unknown): n is PageSize {
  return PAGE_SIZES.includes(n as PageSize);
}

export interface Paged<T> {
  rows: T[];
  /** clamped to 1..pageCount, so a list that shrank never shows a blank page */
  page: number;
  pageCount: number;
  /** 1-based index of the first row shown (0 when empty) */
  start: number;
  /** 1-based index of the last row shown (0 when empty) */
  end: number;
  total: number;
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  const p = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, p), pageCountOf(total, pageSize));
}

export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): Paged<T> {
  const size = isPageSize(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  const total = rows.length;
  const p = clampPage(page, total, size);
  const from = (p - 1) * size;
  const slice = rows.slice(from, from + size);
  return {
    rows: slice,
    page: p,
    pageCount: pageCountOf(total, size),
    start: slice.length ? from + 1 : 0,
    end: from + slice.length,
    total,
  };
}
