// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endSession, startSession } from "./api";
import { clearStoredFilters, FILTER_PREFIX, readStored, removeStored, sameFilter, writeStored } from "./persistedFilter";

describe("persisted filter storage (MISS-0189)", () => {
  beforeEach(() => window.localStorage.clear());

  it("writes, reads and removes a value under the filter prefix", () => {
    writeStored("opportunities", { status: "open", property_id: 3 });
    expect(window.localStorage.getItem(`${FILTER_PREFIX}opportunities`)).toBe('{"status":"open","property_id":3}');
    expect(readStored("opportunities")).toEqual({ status: "open", property_id: 3 });
    removeStored("opportunities");
    expect(readStored("opportunities")).toBeNull();
  });

  it("returns null for a missing or corrupt value", () => {
    expect(readStored("opportunities")).toBeNull();
    window.localStorage.setItem(`${FILTER_PREFIX}opportunities`, "{not json");
    expect(readStored("opportunities")).toBeNull();
  });

  it("clears every remembered filter and nothing else", () => {
    writeStored("opportunities", { status: "done" });
    writeStored("properties", { q: "iptv" });
    window.localStorage.setItem("spider-sidebar", "collapsed");
    window.localStorage.setItem("spider-theme", "dark");
    clearStoredFilters();
    expect(readStored("opportunities")).toBeNull();
    expect(readStored("properties")).toBeNull();
    expect(window.localStorage.getItem("spider-sidebar")).toBe("collapsed");
    expect(window.localStorage.getItem("spider-theme")).toBe("dark");
  });

  it("compares filters ignoring unset fields and key order", () => {
    expect(sameFilter({ status: "active" }, { status: "active", rule: undefined })).toBe(true);
    expect(sameFilter({ status: "active", rule: "low_ctr" }, { rule: "low_ctr", status: "active" })).toBe(true);
    expect(sameFilter({ status: "active" }, { status: "active", rule: "low_ctr" })).toBe(false);
  });
});

describe("session boundaries forget the filters (MISS-0189)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    writeStored("opportunities", { status: "open", property_id: 3 });
  });

  it("logout / expired session clears them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await endSession();
    expect(readStored("opportunities")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("a successful login clears them, a failed one does not", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Invalid credentials" }) }));
    await expect(startSession("a@b.c", "bad")).rejects.toThrow("Invalid credentials");
    expect(readStored("opportunities")).toEqual({ status: "open", property_id: 3 });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 1 } }) }));
    await startSession("a@b.c", "good");
    expect(readStored("opportunities")).toBeNull();
    vi.unstubAllGlobals();
  });
});
