/**
 * Cross-tab sign-out and presence heartbeat (MISS-0199).
 *
 * - Signing out in one tab tells the other tabs of this browser over a BroadcastChannel,
 *   so they leave the app at once instead of showing signed-in data until their next poll.
 * - Every signed-in page sends GET /auth/me every HEARTBEAT_MS while the tab is visible:
 *   it keeps the member "online" for observers (API PRESENCE_TIMEOUT_MS = 5 min) and
 *   notices a session ended elsewhere (the 401 interceptor sends the tab to /login).
 */
export const AUTH_CHANNEL = "spider-auth";
export const HEARTBEAT_MS = 2 * 60_000;
const SIGNED_OUT = "signed-out";

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(AUTH_CHANNEL);
  } catch {
    return null;
  }
}

/** Tell the other tabs of this browser that the session is gone. */
export function announceSignOut(): void {
  const ch = channel();
  if (!ch) return;
  try {
    ch.postMessage(SIGNED_OUT);
  } finally {
    ch.close();
  }
}

/** Calls `onSignedOut` when another tab signs out. Returns the unsubscribe function. */
export function onSignOutElsewhere(onSignedOut: () => void): () => void {
  const ch = channel();
  if (!ch) return () => undefined;
  ch.onmessage = (e: MessageEvent) => {
    if (e.data === SIGNED_OUT) onSignedOut();
  };
  return () => ch.close();
}

/**
 * Runs `check` every HEARTBEAT_MS while the page is visible, and right away when the tab
 * becomes visible again or the page is restored from the back/forward cache (a page shown
 * after sign-out must re-check its session instead of displaying frozen data).
 */
export function startHeartbeat(check: () => void): () => void {
  const visible = () => document.visibilityState === "visible";
  const timer = window.setInterval(() => {
    if (visible()) check();
  }, HEARTBEAT_MS);
  const onVisibility = () => {
    if (visible()) check();
  };
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) check();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
  };
}
