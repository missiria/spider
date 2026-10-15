export type PeriodSelection = { kind: "preset"; days: number } | { kind: "custom"; start: string; end: string };

export const DEFAULT_PERIOD: PeriodSelection = { kind: "preset", days: 28 };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function periodParams(p: PeriodSelection): { days?: number; start?: string; end?: string } {
  return p.kind === "preset" ? { days: p.days } : { start: p.start, end: p.end };
}

export function isValidCustom(start: string, end: string): boolean {
  return ISO.test(start) && ISO.test(end) && start <= end;
}

/** Restore a selection from a saved-view config; falls back to the default on anything odd. */
export function periodFromConfig(raw: unknown): PeriodSelection {
  const c = raw as { days?: unknown; start?: unknown; end?: unknown } | null;
  if (c && typeof c.start === "string" && typeof c.end === "string" && isValidCustom(c.start, c.end)) {
    return { kind: "custom", start: c.start, end: c.end };
  }
  if (c && typeof c.days === "number" && c.days > 0 && c.days <= 487) {
    return { kind: "preset", days: c.days };
  }
  return DEFAULT_PERIOD;
}
