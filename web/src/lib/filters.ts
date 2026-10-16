import type { KeyFilters } from "./types";

/**
 * One filter state for the property page, saved views and reports (MISS-0092 / MISS-0110).
 * Stored rows are per dimension, so the API accepts filters on ONE dimension at a time;
 * this module keeps the client state in that shape.
 */
export const FILTER_KEYS = [
  "include_query",
  "exclude_query",
  "include_page",
  "exclude_page",
  "country",
  "device",
] as const;

export function splitKeys(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Add or remove `key` from a comma-separated list; empty list → undefined. */
export function toggleKey(
  list: string | undefined,
  key: string,
): string | undefined {
  const keys = splitKeys(list);
  const next = keys.includes(key)
    ? keys.filter((k) => k !== key)
    : [...keys, key];
  return next.length ? next.join(",") : undefined;
}

/** Read a saved view / report filter config back into filter state (unknown keys dropped). */
export function filtersFromConfig(raw: unknown): KeyFilters {
  if (!raw || typeof raw !== "object") return {};
  const out: KeyFilters = {};
  for (const k of FILTER_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}
