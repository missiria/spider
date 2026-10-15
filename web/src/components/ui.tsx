"use client";

import { deltaTone, formatDelta } from "@/lib/format";
import type { PropertyStatus } from "@/lib/types";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface ${className}`}>{children}</div>;
}

export function DeltaBadge({ value, lowerIsBetter = false }: { value: number | null | undefined; lowerIsBetter?: boolean }) {
  const tone = deltaTone(value, lowerIsBetter);
  const cls =
    tone === "up"
      ? "bg-success-soft text-success"
      : tone === "down"
        ? "bg-danger-soft text-danger"
        : "bg-surface-muted text-muted";
  return <span className={`tabular inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}>{formatDelta(value)}</span>;
}

const STATUS: Record<PropertyStatus, { label: string; cls: string }> = {
  pending: { label: "Pending access", cls: "bg-warning-soft text-warning" },
  connected: { label: "Connected", cls: "bg-success-soft text-success" },
  revoked: { label: "Access revoked", cls: "bg-danger-soft text-danger" },
  error: { label: "Error", cls: "bg-danger-soft text-danger" },
};

export function StatusChip({ status }: { status: PropertyStatus }) {
  const s = STATUS[status];
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function KpiCard({
  label,
  value,
  delta,
  lowerIsBetter,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tabular text-2xl font-semibold">{value}</div>
        {delta !== undefined && <DeltaBadge value={delta} lowerIsBetter={lowerIsBetter} />}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-hover",
    secondary: "border border-border bg-surface hover:bg-surface-muted",
    danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <div className="text-lg font-medium">{title}</div>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </Card>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
      {message}
    </div>
  );
}
