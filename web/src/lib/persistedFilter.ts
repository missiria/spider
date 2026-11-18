/**
 * List-filter memory for the login session (MISS-0189).
 *
 * Filters are kept in localStorage under `spider:filters:<name>` so they survive a detail
 * view, a reload and a new tab. Every key is wiped when a session starts or ends (login,
 * logout, 401), so a new login always starts from the defaults and nothing leaks to
 * another account on the same browser.
 */
export const FILTER_PREFIX = "spider:filters:";

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** Stored value for `name`, or null when missing, unreadable or not valid JSON. */
export function readStored(name: string): unknown {
  try {
    const raw = storage()?.getItem(FILTER_PREFIX + name);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeStored(name: string, value: unknown): void {
  try {
    storage()?.setItem(FILTER_PREFIX + name, JSON.stringify(value));
  } catch {
    /* per-browser convenience only */
  }
}

export function removeStored(name: string): void {
  try {
    storage()?.removeItem(FILTER_PREFIX + name);
  } catch {
    /* per-browser convenience only */
  }
}

/** Forget every remembered list filter. Other preferences (theme, sidebar) are kept. */
export function clearStoredFilters(): void {
  try {
    const s = storage();
    if (!s) return;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(FILTER_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* per-browser convenience only */
  }
}

/** Same filter when every set (non-undefined) field matches; key order is irrelevant. */
export function sameFilter(a: object, b: object): boolean {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (x[k] !== y[k]) return false;
  return true;
}
