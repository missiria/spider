import { BadRequestException } from '@nestjs/common';

/** Rows per page of the inspected-URL list, as in Search Console (MISS-0195). */
export const URL_PAGE_SIZES = [10, 50, 250] as const;
export type UrlPageSize = (typeof URL_PAGE_SIZES)[number];
export const DEFAULT_URL_PAGE_SIZE: UrlPageSize = 10;

/** `?page_size=`: absent → 10; anything but 10, 50 or 250 → 400. */
export function parseUrlPageSize(raw: string | undefined): UrlPageSize {
  if (raw === undefined || raw === '') return DEFAULT_URL_PAGE_SIZE;
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!URL_PAGE_SIZES.includes(n as UrlPageSize)) {
    throw new BadRequestException(
      `page_size must be one of ${URL_PAGE_SIZES.join(', ')}`,
    );
  }
  return n as UrlPageSize;
}
