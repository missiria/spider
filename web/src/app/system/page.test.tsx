// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSyncHealth = vi.fn();
const listUsers = vi.fn();
const getMe = vi.fn();
const revokeUserSessions = vi.fn();
vi.mock("@/lib/api", () => ({
  getSyncHealth: (...a: unknown[]) => getSyncHealth(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  getMe: (...a: unknown[]) => getMe(...a),
  revokeUserSessions: (...a: unknown[]) => revokeUserSessions(...a),
  deactivateUser: vi.fn(),
  endSession: vi.fn(),
  inviteUser: vi.fn(),
  revokeMySessions: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/EmailBrandLink", () => ({ EmailBrandLink: () => null }));
vi.mock("@/components/SignupsCard", () => ({ SignupsCard: () => null }));
vi.mock("@/components/SuperAdminLink", () => ({ SuperAdminLink: () => null }));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import SystemPage from "./page";

const HEALTH = {
  ok: true,
  complete: true,
  mock: false,
  properties: {
    total: 0,
    connected: 0,
    pending: 0,
    revoked: 0,
    error: 0,
    stale: [],
    partial: [],
    with_errors: [],
  },
  failed_runs: [],
};
const ADMIN = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  role: "admin",
  created_at: "2026-11-01T00:00:00Z",
};
const member = (presence: object) => ({
  id: 2,
  email: "bob@example.com",
  name: "Bob",
  role: "member",
  created_at: "2026-11-02T00:00:00Z",
  presence,
});

describe("System → Users presence (MISS-0199)", () => {
  beforeEach(() => {
    getSyncHealth.mockResolvedValue(HEALTH);
    getMe.mockResolvedValue(ADMIN);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("labels online, last seen and never-seen members and explains the timeout", async () => {
    listUsers.mockResolvedValue({
      presence_timeout_ms: 300_000,
      items: [
        {
          ...ADMIN,
          presence: {
            online: true,
            last_seen_at: new Date().toISOString(),
            sessions: 2,
          },
        },
        member({
          online: false,
          last_seen_at: new Date(Date.now() - 12 * 60_000).toISOString(),
          sessions: 0,
        }),
        {
          ...member({ online: false, last_seen_at: null, sessions: 0 }),
          id: 3,
          name: "Cy",
          email: "cy@example.com",
        },
      ],
    });
    render(<SystemPage />);
    expect(await screen.findByText("Online")).toBeTruthy();
    expect(screen.getByText("· 2 sessions")).toBeTruthy();
    expect(screen.getByText("Last seen 12 min ago")).toBeTruthy();
    expect(screen.getByText("Not seen yet")).toBeTruthy();
    expect(screen.getByText(/active in the last 5 min/)).toBeTruthy();
    expect(screen.getByTestId("users-updated").textContent).toMatch(
      /^Updated /,
    );
  });

  it("sign out everywhere reloads the list so the member flips offline at once", async () => {
    listUsers.mockResolvedValueOnce({
      items: [
        ADMIN,
        member({
          online: true,
          last_seen_at: new Date().toISOString(),
          sessions: 1,
        }),
      ],
    });
    revokeUserSessions.mockResolvedValue(undefined);
    render(<SystemPage />);
    await screen.findByText("Online");
    listUsers.mockResolvedValue({
      items: [
        ADMIN,
        member({
          online: false,
          last_seen_at: new Date().toISOString(),
          sessions: 0,
        }),
      ],
    });
    fireEvent.click(screen.getByText("Sign out everywhere"));
    await waitFor(() => expect(screen.queryByText("Online")).toBeNull());
    expect(screen.getByText("Last seen just now")).toBeTruthy();
    expect(revokeUserSessions).toHaveBeenCalledWith(2);
  });

  it("a failed refresh marks the old list as out of date instead of passing it off as current", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listUsers.mockResolvedValueOnce({
      items: [
        ADMIN,
        member({
          online: true,
          last_seen_at: new Date().toISOString(),
          sessions: 1,
        }),
      ],
    });
    render(<SystemPage />);
    await screen.findByText("Online");
    listUsers.mockRejectedValue(new Error("Network Error"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() =>
      expect(screen.getByTestId("users-updated").textContent).toMatch(
        /^Out of date — last updated /,
      ),
    );
  });

  it("refreshes as soon as the tab becomes visible again", async () => {
    listUsers.mockResolvedValue({ items: [ADMIN] });
    render(<SystemPage />);
    await screen.findByText("Ada");
    const calls = listUsers.mock.calls.length;
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(listUsers.mock.calls.length).toBe(calls + 1));
  });
});
