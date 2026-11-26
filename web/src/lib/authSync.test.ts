// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_MS,
  announceSignOut,
  onSignOutElsewhere,
  startHeartbeat,
} from "./authSync";

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: v,
    configurable: true,
  });
}

describe("authSync (MISS-0199)", () => {
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("a sign-out in one tab reaches the other tabs", async () => {
    const seen = vi.fn();
    const stop = onSignOutElsewhere(seen);
    announceSignOut();
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    stop();
    announceSignOut();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("heartbeats only while visible, and re-checks on return and on back/forward restore", () => {
    vi.useFakeTimers();
    const check = vi.fn();
    setVisibility("visible");
    const stop = startHeartbeat(check);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(check).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(check).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(check).toHaveBeenCalledTimes(2);

    const restored = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    expect(check).toHaveBeenCalledTimes(3);

    stop();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(check).toHaveBeenCalledTimes(3);
  });
});
