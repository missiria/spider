// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readStored, writeStored } from "./persistedFilter";
import { usePersistedFilter } from "./usePersistedFilter";

interface F {
  status: string;
  rule?: string;
}
const DEFAULTS: F = { status: "active" };
const sanitize = (raw: unknown): F => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: F = { status: typeof r.status === "string" ? r.status : "active" };
  if (typeof r.rule === "string") out.rule = r.rule;
  return out;
};

describe("usePersistedFilter (MISS-0189)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("starts from the defaults and stores nothing", () => {
    const { result } = renderHook(() => usePersistedFilter("t", DEFAULTS, sanitize));
    expect(result.current.ready).toBe(true);
    expect(result.current.value).toEqual(DEFAULTS);
    expect(readStored("t")).toBeNull();
  });

  it("restores the stored value through the sanitizer", () => {
    writeStored("t", { status: "done", rule: "low_ctr", junk: 1 });
    const { result } = renderHook(() => usePersistedFilter("t", DEFAULTS, sanitize));
    expect(result.current.value).toEqual({ status: "done", rule: "low_ctr" });
  });

  it("stores changes and survives a remount", () => {
    const first = renderHook(() => usePersistedFilter("t", DEFAULTS, sanitize));
    act(() => first.result.current.setValue((f) => ({ ...f, rule: "cannibalization" })));
    expect(readStored("t")).toEqual({ status: "active", rule: "cannibalization" });
    first.unmount();
    const second = renderHook(() => usePersistedFilter("t", DEFAULTS, sanitize));
    expect(second.result.current.value).toEqual({ status: "active", rule: "cannibalization" });
  });

  it("reset returns to the defaults and removes the stored value", () => {
    writeStored("t", { status: "done" });
    const { result } = renderHook(() => usePersistedFilter("t", DEFAULTS, sanitize));
    act(() => result.current.reset());
    expect(result.current.value).toEqual(DEFAULTS);
    expect(readStored("t")).toBeNull();
  });

  it("going back to the defaults by hand also removes the stored value", () => {
    writeStored("t", { status: "done" });
    const { result } = renderHook(() => usePersistedFilter("t", DEFAULTS, sanitize));
    act(() => result.current.setValue({ status: "active", rule: undefined }));
    expect(readStored("t")).toBeNull();
  });
});
