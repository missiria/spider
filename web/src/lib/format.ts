const intFmt = new Intl.NumberFormat("en-US");

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return intFmt.format(Math.round(value));
}

export function formatPct(ratio: number | null | undefined, digits = 2): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatPosition(value: number | null | undefined): string {
  if (!value) return "—";
  return value.toFixed(1);
}

/** Signed percentage from a ratio delta; "—" when the previous period was empty. */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const pct = Math.round(value * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** For position, lower is better: invert the sign semantics for colouring. */
export function deltaTone(value: number | null | undefined, lowerIsBetter = false): "up" | "down" | "flat" {
  if (value === null || value === undefined || Number.isNaN(value) || Math.round(value * 100) === 0) {
    return "flat";
  }
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return improved ? "up" : "down";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function shortDate(iso: string): string {
  // 2026-10-12 → 12 Oct
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** "just now", "12 min ago", "3 h ago", then the date (members' last seen, MISS-0199). */
export function formatAgo(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return formatDateTime(iso);
}
