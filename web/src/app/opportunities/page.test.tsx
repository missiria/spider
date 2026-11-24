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

// each case renders up to 50 cards with 4 controls: slow in jsdom on a busy machine
describe("Opportunities list is paged (MISS-0197)", { timeout: 30_000 }, () => {
  const item = (id: number) => ({
    id,
    property_id: 3,
    rule: "low_ctr",
    subject: "page",
    key_text: `https://example.com/p${id}`,
    status: "open",
    priority: "medium",
    score: 50,
    confidence: "medium",
    title: `Opportunity ${id}`,
    reason: "",
    suggested_action: "",
    evidence: {},
    assignee_id: null,
    due_date: null,
    completed_at: null,
    dismissed_at: null,
    first_seen_at: "2026-11-01T00:00:00.000Z",
    last_seen_at: "2026-11-20T00:00:00.000Z",
  });
  const lastPaging = () => listOpportunities.mock.calls.at(-1)?.[1];

  beforeEach(() => {
    window.localStorage.clear();
    // 478 rows on the server, one page of them in the response
    listOpportunities.mockImplementation(async (_f: unknown, paging: { page: number; page_size: number }) => {
      const last = Math.ceil(478 / paging.page_size);
      const page = Math.min(paging.page, last);
      const from = (page - 1) * paging.page_size;
      const n = Math.min(paging.page_size, 478 - from);
      return { items: Array.from({ length: n }, (_, i) => item(from + i + 1)), counts: { open: 421, in_progress: 57, done: 32, dismissed: 0 }, scanning: false, total: 478, page, page_size: paging.page_size };
    });
    getProperties.mockResolvedValue({ items: [{ id: 3, display_name: "iptv-premium-europe.com" }] });
    listUsers.mockResolvedValue({ items: [] });
  });
  afterEach(cleanup);

  it("asks for 10 rows, shows the total and moves between pages", async () => {
    render(<OpportunitiesPage />);
    await screen.findByText("Opportunity 1");
    expect(lastPaging()).toEqual({ page: 1, page_size: 10 });
    expect(screen.getAllByRole("link", { name: /^Opportunity \d+$/ })).toHaveLength(10);
    expect(screen.getByText("478 items")).toBeTruthy();
    expect(screen.getByText("1–10 of 478")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Opportunity 11");
    expect(lastPaging()).toEqual({ page: 2, page_size: 10 });
    expect(screen.getByText("11–20 of 478")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
    await screen.findByText("1–50 of 478");
    expect(lastPaging()).toEqual({ page: 1, page_size: 50 });
  });

  it("goes back to page 1 when a filter changes", async () => {
    render(<OpportunitiesPage />);
    await screen.findByText("Opportunity 1");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Opportunity 11");
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "low_ctr" } });
    await waitFor(() => expect(lastFilter()).toEqual({ status: "active", rule: "low_ctr" }));
    expect(lastPaging()).toEqual({ page: 1, page_size: 10 });
  });

  it("comes back on the page left, and follows the server when that page no longer exists", async () => {
    writeStored("opportunities:paging", { page: 3, page_size: 50 });
    const first = render(<OpportunitiesPage />);
    await screen.findByText("101–150 of 478");
    for (const [, p] of listOpportunities.mock.calls) expect(p).toEqual({ page: 3, page_size: 50 });
    first.unmount();

    writeStored("opportunities:paging", { page: 99, page_size: 50 });
    render(<OpportunitiesPage />);
    await screen.findByText("451–478 of 478");
    expect(readStored("opportunities:paging")).toEqual({ page: 10, page_size: 50 });
  });

  it("ignores a stored page size that is not 10, 50 or 250", async () => {
    writeStored("opportunities:paging", { page: -4, page_size: 7 });
    render(<OpportunitiesPage />);
    await screen.findByText("1–10 of 478");
    expect(lastPaging()).toEqual({ page: 1, page_size: 10 });
  });
});
