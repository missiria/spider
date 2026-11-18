"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readStored, removeStored, sameFilter, writeStored } from "./persistedFilter";

export interface PersistedFilter<T> {
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  /** Back to the defaults; the stored value is removed. */
  reset: () => void;
  /** False until the stored value has been read. Wait for it before fetching with `value`. */
  ready: boolean;
}

/**
 * Filter state remembered for the login session (MISS-0189).
 *
 * Renders with `defaults` first (same markup on server and client), then restores the
 * stored value after mount. `defaults` and `sanitize` must be stable references.
 */
export function usePersistedFilter<T extends object>(name: string, defaults: T, sanitize: (raw: unknown) => T): PersistedFilter<T> {
  const [value, setValue] = useState<T>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = readStored(name);
    if (raw !== null) setValue(sanitize(raw));
    setReady(true);
  }, [name, sanitize]);

  useEffect(() => {
    if (!ready) return;
    if (sameFilter(value, defaults)) removeStored(name);
    else writeStored(name, value);
  }, [ready, name, value, defaults]);

  const reset = useCallback(() => setValue(defaults), [defaults]);

  return { value, setValue, reset, ready };
}
