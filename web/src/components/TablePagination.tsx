"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatInt } from "@/lib/format";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  clampPage,
  isPageSize,
  pageCountOf,
  type PageSize,
} from "@/lib/pagination";

/**
 * Search Console style table footer (MISS-0195): "Rows per page [10 ▾]  1–10 of 312  ‹ ›".
 * Works for client-side slices and server pages alike: it only needs the total and the current page.
 * Hidden when the table fits the smallest page; the arrows hide when every row fits the chosen size.
 */
export function TablePagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  noun,
  className = "",
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  /** what the rows are, for the accessible name: "Top pages" → "Top pages pagination" */
  noun: string;
  className?: string;
}) {
  if (total <= DEFAULT_PAGE_SIZE) return null;
  const pageCount = pageCountOf(total, pageSize);
  const current = clampPage(page, total, pageSize);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(total, current * pageSize);
  const arrowCls =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <nav
      aria-label={`${noun} pagination`}
      className={`flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t border-border px-4 py-2 text-sm text-muted ${className}`}
    >
      <label className="flex items-center gap-2">
        <span className="whitespace-nowrap">Rows per page</span>
        <select
          aria-label="Rows per page"
          value={pageSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (isPageSize(n)) onPageSize(n);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-foreground outline-none focus:border-primary"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span className="tabular whitespace-nowrap" aria-live="polite">
        {formatInt(start)}–{formatInt(end)} of {formatInt(total)}
      </span>
      {total > pageSize && (
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => onPage(current - 1)}
            className={arrowCls}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={current >= pageCount}
            onClick={() => onPage(current + 1)}
            className={arrowCls}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </span>
      )}
    </nav>
  );
}
