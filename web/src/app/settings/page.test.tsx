// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMe = vi.fn();
const getSettings = vi.fn();
const updateMe = vi.fn();
vi.mock("@/lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getSettings: (...a: unknown[]) => getSettings(...a),
  updateMe: (...a: unknown[]) => updateMe(...a),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/IntegrationsSettings", () => ({
  AlertsSettings: () => null,
  WebhooksSettings: () => null,
}));
vi.mock("@/components/BrandSettings", () => ({ BrandSettings: () => null }));
vi.mock("@/components/RulesSettings", () => ({ RulesSettings: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import SettingsPage from "./page";

const ME = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  role: "admin",
  created_at: "2026-11-01T00:00:00Z",
};
const SETTINGS = {
  workspace: { name: "MISSIRIA", slug: "missiria" },
  serviceAccountEmail: "sa@example.iam.gserviceaccount.com",
  mock: true,
  schedule: { accessCheck: "every 10 min", incrementalSync: "daily 06:10" },
};

describe("Settings → General: weekly opportunities email (MISS-0196)", () => {
  beforeEach(() => {
    getSettings.mockResolvedValue(SETTINGS);
  });
  afterEach(cleanup);

  it("shows the stored preference and turns it off with PATCH /auth/me", async () => {
    getMe.mockResolvedValue({ ...ME, weekly_opportunities_email: true });
    updateMe.mockResolvedValue({ ...ME, weekly_opportunities_email: false });
    render(<SettingsPage />);
    const box = (await screen.findByRole("checkbox", {
      name: /Weekly opportunities email/,
    })) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() =>
      expect(updateMe).toHaveBeenCalledWith({
        weekly_opportunities_email: false,
      }),
    );
    await waitFor(() => expect(box.checked).toBe(false));
    // only the preference is sent, never the unsaved name/email form
    expect(Object.keys(updateMe.mock.calls[0][0])).toEqual([
      "weekly_opportunities_email",
    ]);
  });

  it("turns it back on", async () => {
    getMe.mockResolvedValue({ ...ME, weekly_opportunities_email: false });
    updateMe.mockResolvedValue({ ...ME, weekly_opportunities_email: true });
    render(<SettingsPage />);
    const box = (await screen.findByRole("checkbox", {
      name: /Weekly opportunities email/,
    })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() =>
      expect(updateMe).toHaveBeenCalledWith({
        weekly_opportunities_email: true,
      }),
    );
    await waitFor(() => expect(box.checked).toBe(true));
  });

  it("is the Email preferences target of the digest footer link", async () => {
    getMe.mockResolvedValue({ ...ME, weekly_opportunities_email: true });
    const { container } = render(<SettingsPage />);
    await screen.findByRole("checkbox", { name: /Weekly opportunities email/ });
    expect(container.querySelector("#email-preferences")).not.toBeNull();
  });
});
