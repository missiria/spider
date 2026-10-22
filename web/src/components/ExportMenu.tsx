"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

export interface ExportMenuItem {
  key: string;
  label: string;
  kind: "pdf" | "csv" | "copy" | "json";
  /** download / open link */
  href?: string;
  /** action (Copy) */
  onSelect?: () => void;
  /** group heading printed above the first item of each group */
  group: string;
}

const ICONS = {
  pdf: FileText,
  csv: FileSpreadsheet,
  copy: Copy,
  json: FileJson,
};

/**
 * One Export menu per report view (MISS-0135): PDF, CSV per section, Copy per visible table,
 * JSON. A disclosure button + list of links/buttons: keyboard (Enter/Space, arrows, Escape)
 * and screen readers get the native semantics of each item.
 */
export function ExportMenu({
  items,
  label = "Export",
}: {
  items: ExportMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    root.current?.querySelector<HTMLElement>("[data-export-item]")?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const nodes = Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-export-item]") ?? [],
    );
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(i + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
    }
  };

  let lastGroup = "";
  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Download className="h-4 w-4" aria-hidden /> {label}{" "}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={listId}
          className="absolute right-0 z-30 mt-1 max-h-96 w-72 overflow-auto rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
        >
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const cls =
              "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none";
            return (
              <li key={item.key}>
                {heading && (
                  <div className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                    {heading}
                  </div>
                )}
                {item.href ? (
                  <a
                    data-export-item
                    href={item.href}
                    {...(item.kind === "json"
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                    onClick={() => setOpen(false)}
                    className={cls}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />{" "}
                    {item.label}
                  </a>
                ) : (
                  <button
                    data-export-item
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      button.current?.focus();
                      item.onSelect?.();
                    }}
                    className={cls}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />{" "}
                    {item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
