// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStored, writeStored } from "@/lib/persistedFilter";

const listOpportunities = vi.fn();
const getProperties = vi.fn();
const listUsers = vi.fn();
const scanOpportunities = vi.fn();
const assignScanResults = vi.fn();
vi.mock("@/lib/api", () => ({
  listOpportunities: (...a: unknown[]) => listOpportunities(...a),
  getProperties: (...a: unknown[]) => getProperties(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  runScan: (...a: unknown[]) => scanOpportunities(...a),
  assignScanResults: (...a: unknown[]) => assignScanResults(...a),
  updateOpportunity: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("react-toastify", () => ({ toast }));

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

describe("post-scan assignment modal (MISS-0203)", () => {
  const SCAN = {
    scan_id: "6f1c1a52-5f43-4b8e-9d1e-0a3c5a6b7c8d",
    properties: 2,
    failed: 0,
    created: 4,
    updated: 5,
    reopened: 1,
    findings: 10,
    skipped: 0,
    new_items: [
      { id: 11, property_id: 3, rule: "clicks_drop", subject: "page", key_text: "https://a.test/x", priority: "high", title: "Clicks drop on /x" },
      { id: 12, property_id: 3, rule: "clicks_drop", subject: "page", key_text: "https://a.test/y", priority: "high", title: "Clicks drop on /y" },
      { id: 13, property_id: 4, rule: "low_ctr", subject: "query", key_text: "iptv", priority: "medium", title: "Low CTR on iptv" },
      { id: 14, property_id: 4, rule: "near_page_one", subject: "query", key_text: "lion", priority: "low", title: "Near page one: lion" },
    ],
  };
  const scanButton = () => screen.getByRole("button", { name: /scan now/i });

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    listOpportunities.mockResolvedValue(EMPTY);
    getProperties.mockResolvedValue({ items: [{ id: 3, display_name: "a.test" }, { id: 4, display_name: "b.test" }] });
    listUsers.mockResolvedValue({ items: [{ id: 2, name: "Ada" }, { id: 5, name: "Bob" }] });
  });
  afterEach(cleanup);

  it("opens once after the scan with the exact total, priority groups, rule breakdown and labelled selectors", async () => {
    scanOpportunities.mockResolvedValue(SCAN);
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    const dialog = await screen.findByRole("dialog", { name: "New opportunities" });
    expect(dialog.textContent).toContain("4 new items");
    expect(dialog.textContent).toContain("5 refreshed and 1 reopened: not included below");
    expect(screen.getByLabelText("Assign High priority items to")).toBeTruthy();
    expect(screen.getByLabelText("Assign Medium priority items to")).toBeTruthy();
    expect(screen.getByLabelText("Assign Low priority items to")).toBeTruthy();
    expect(dialog.textContent).toContain("Clicks drop · 2");
    expect(scanOpportunities).toHaveBeenCalledTimes(1);
    // the list was reloaded after the scan
    expect(listOpportunities.mock.calls.length).toBeGreaterThanOrEqual(2);
    // a group's items can be viewed
    fireEvent.click(screen.getAllByRole("button", { name: /view items/i })[0]);
    expect(screen.getByRole("link", { name: "Clicks drop on /y" }).getAttribute("href")).toBe("/opportunities/12");
  });

  it("assigns only the groups with a member chosen, then refreshes and closes", async () => {
    scanOpportunities.mockResolvedValue(SCAN);
    assignScanResults.mockResolvedValue({ assigned: [{ id: 11, assignee_id: 5 }, { id: 12, assignee_id: 5 }], unchanged: [], conflicts: [], skipped: [] });
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    await screen.findByRole("dialog");
    expect((screen.getByRole("button", { name: /assign selected groups/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Assign High priority items to"), { target: { value: "5" } });
    const reloads = listOpportunities.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Assign selected groups (2)" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(assignScanResults).toHaveBeenCalledWith(SCAN.scan_id, [{ assignee_id: 5, ids: [11, 12] }]);
    expect(listOpportunities.mock.calls.length).toBeGreaterThan(reloads);
    expect(toast.success).toHaveBeenCalledWith("2 opportunities assigned");
    expect(scanOpportunities).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open on a conflict and lists who holds the item", async () => {
    scanOpportunities.mockResolvedValue(SCAN);
    assignScanResults.mockResolvedValue({ assigned: [{ id: 11, assignee_id: 5 }], unchanged: [], conflicts: [{ id: 12, assignee_id: 2 }], skipped: [] });
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Assign High priority items to"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /assign selected groups/i }));
    await screen.findByText("Clicks drop on /y: kept with Ada");
    expect(toast.warning).toHaveBeenCalledWith("1 opportunity assigned · 1 already assigned by someone else (kept)");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("a failed save can be retried without rescanning", async () => {
    scanOpportunities.mockResolvedValue(SCAN);
    assignScanResults.mockRejectedValueOnce("network down").mockResolvedValueOnce({ assigned: [{ id: 14, assignee_id: 2 }], unchanged: [], conflicts: [], skipped: [] });
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Assign Low priority items to"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /assign selected groups/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry assignment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(assignScanResults).toHaveBeenCalledTimes(2);
    expect(assignScanResults.mock.calls[1]).toEqual(assignScanResults.mock.calls[0]);
    expect(scanOpportunities).toHaveBeenCalledTimes(1);
  });

  it("Escape and Not now close without assigning; focus returns to Scan now", async () => {
    scanOpportunities.mockResolvedValue(SCAN);
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(scanButton());
    fireEvent.click(scanButton());
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(assignScanResults).not.toHaveBeenCalled();
  });

  it("Tab stays inside the dialog", async () => {
    scanOpportunities.mockResolvedValue(SCAN);
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    const dialog = await screen.findByRole("dialog");
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
  });

  it("a scan with nothing new shows a message, never an empty modal", async () => {
    scanOpportunities.mockResolvedValue({ ...SCAN, created: 0, new_items: [] });
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Scan complete: no new opportunities across 2 properties · 5 refreshed · 1 reopened"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a failed scan shows an error, no modal, and the button works again", async () => {
    scanOpportunities.mockRejectedValueOnce("A scan is already running");
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    const button = scanButton();
    fireEvent.click(button);
    fireEvent.click(button); // double click: one request
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Scan failed: A scan is already running"));
    expect(scanOpportunities).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect((scanButton() as HTMLButtonElement).disabled).toBe(false));
  });

  it("without members the selectors are disabled and the items stay unassigned", async () => {
    listUsers.mockResolvedValue({ items: [] });
    scanOpportunities.mockResolvedValue(SCAN);
    render(<OpportunitiesPage />);
    await screen.findByRole("option", { name: "a.test" });
    fireEvent.click(scanButton());
    await screen.findByText(/No members to assign to/);
    expect((screen.getByLabelText("Assign High priority items to") as HTMLSelectElement).disabled).toBe(true);
  });
});
