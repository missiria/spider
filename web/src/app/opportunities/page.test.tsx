// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStored, writeStored } from "@/lib/persistedFilter";

const listOpportunities = vi.fn();
const getProperties = vi.fn();
const listUsers = vi.fn();
vi.mock("@/lib/api", () => ({
  listOpportunities: (...a: unknown[]) => listOpportunities(...a),
  getProperties: (...a: unknown[]) => getProperties(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  scanOpportunities: vi.fn(),
  updateOpportunity: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import OpportunitiesPage from "./page";

const EMPTY = { items: [], counts: { open: 0, in_progress: 0, done: 0, dismissed: 0 }, scanning: false };
const lastFilter = () => listOpportunities.mock.calls.at(-1)?.[0];

describe("Opportunities list remembers its filters (MISS-0189)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    listOpportunities.mockResolvedValue(EMPTY);
    getProperties.mockResolvedValue({ items: [{ id: 3, display_name: "iptv-premium-europe.com" }, { id: 4, display_name: "iptv-lion.com" }] });
    listUsers.mockResolvedValue({ items: [{ id: 2, name: "Ada" }] });
  });
  afterEach(cleanup);

  it("restores the filters after leaving the page and coming back", async () => {
    const first = render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "iptv-premium-europe.com" });
    fireEvent.change(screen.getByLabelText("Property"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "cannibalization" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
    const chosen = { status: "active", property_id: 3, rule: "cannibalization", priority: "high" };
    await waitFor(() => expect(lastFilter()).toEqual(chosen));

    first.unmount(); // open an opportunity…
    listOpportunities.mockClear();
    render(<OpportunitiesPage />); // …and click "← Opportunities"

    await waitFor(() => expect(listOpportunities).toHaveBeenCalled());
    // never fetched with the defaults first
    for (const [f] of listOpportunities.mock.calls) expect(f).toEqual(chosen);
    await screen.findByRole("option", { name: "iptv-premium-europe.com" });
    expect((screen.getByLabelText("Property") as HTMLSelectElement).value).toBe("3");
    expect((screen.getByLabelText("Rule") as HTMLSelectElement).value).toBe("cannibalization");
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("high");
  });

  it("Reset filters goes back to Active only and forgets the stored value", async () => {
    writeStored("opportunities", { status: "done", rule: "low_ctr" });
    render(<OpportunitiesPage />);
    await waitFor(() => expect(lastFilter()).toEqual({ status: "done", rule: "low_ctr" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(lastFilter()).toEqual({ status: "active" }));
    expect(readStored("opportunities")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
  });

  it("shows no Reset control on the default filter", async () => {
    render(<OpportunitiesPage />);
    await waitFor(() => expect(lastFilter()).toEqual({ status: "active" }));
    expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
  });

  it("silently drops a remembered property and assignee that no longer exist", async () => {
    writeStored("opportunities", { status: "open", property_id: 99, assignee_id: 77, rule: "low_ctr" });
    render(<OpportunitiesPage />);
    await waitFor(() => expect(lastFilter()).toEqual({ status: "open", rule: "low_ctr" }));
    expect(readStored("opportunities")).toEqual({ status: "open", rule: "low_ctr" });
  });

  it("keeps the remembered property when the option list cannot be loaded", async () => {
    getProperties.mockRejectedValue(new Error("offline"));
    listUsers.mockRejectedValue(new Error("offline"));
    writeStored("opportunities", { status: "open", property_id: 99 });
    render(<OpportunitiesPage />);
    await waitFor(() => expect(lastFilter()).toEqual({ status: "open", property_id: 99 }));
    expect(readStored("opportunities")).toEqual({ status: "open", property_id: 99 });
  });
});
