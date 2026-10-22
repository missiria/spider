"use client";

import { Copy, FileSpreadsheet } from "lucide-react";
import { displayCell, type ExportTable } from "@/lib/exportTable";
import { formatDateTime } from "@/lib/format";
import type { ReportData } from "@/lib/types";

/**
 * On-screen report (MISS-0135): the same tables, notes, period comparison and freshness the
 * PDF prints. Each table has Copy (tab-separated, exactly the rows shown) and CSV buttons.
 */
export function ReportPreview({
  data,
  tables,
  csvHref,
  onCopy,
}: {
  data: ReportData;
  tables: ExportTable[];
  csvHref: (section: string) => string;
  onCopy: (table: ExportTable) => void;
}) {
  return (
    <section
      className="mt-4 border-t border-border pt-4"
      aria-label={`Preview of ${data.title}`}
    >
      <dl className="grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-3">
        <div>
          <dt className="inline">Period: </dt>
          <dd className="inline text-foreground">
            {data.period.start} → {data.period.end}
          </dd>
        </div>
        <div>
          <dt className="inline">Compared with: </dt>
          <dd className="inline text-foreground">
            {data.previousPeriod.start} → {data.previousPeriod.end}
          </dd>
        </div>
        <div>
          <dt className="inline">GSC data through: </dt>
          <dd className="inline text-foreground">
            {data.data_through ?? "n/a"}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="inline">Generated: </dt>
          <dd className="inline">
            {formatDateTime(data.generated_at)} · Source: Google Search Console
            (web search)
          </dd>
        </div>
      </dl>
      {data.notes && (
        <p className="mt-3 whitespace-pre-line text-sm">{data.notes}</p>
      )}
      {tables.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          This report has no table sections.
        </p>
      )}
      {tables.map((t, i) => {
        const id = `report-${data.report_id}-table-${i}`;
        return (
          <div key={id} className="mt-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 id={id} className="text-sm font-medium">
                {t.title}
              </h3>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onCopy(t)}
                  disabled={t.rows.length === 0}
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Copy ${t.title} table`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                </button>
                <a
                  href={csvHref(t.section)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label={`Download ${t.section} CSV`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> CSV
                </a>
              </div>
            </div>
            {t.note && <p className="mt-1 text-xs text-muted">{t.note}</p>}
            {t.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No rows for this period.
              </p>
            ) : (
              <div className="mt-2 max-h-96 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm" aria-labelledby={id}>
                  <thead className="sticky top-0 bg-surface-muted text-xs text-muted">
                    <tr>
                      {t.columns.map((c, ci) => (
                        <th
                          key={ci}
                          scope="col"
                          className={`px-3 py-2 font-medium ${c.kind === "text" ? "text-left" : "text-right"}`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, ri) => (
                      <tr key={ri} className="border-t border-border">
                        {r.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`px-3 py-1.5 ${t.columns[ci].kind === "text" ? "max-w-md break-words text-left" : "text-right tabular-nums"}`}
                          >
                            {displayCell(cell, t.columns[ci].kind)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
