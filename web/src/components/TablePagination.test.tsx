// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TablePagination } from "./TablePagination";

afterEach(cleanup);

function setup(
  props: Partial<React.ComponentProps<typeof TablePagination>> = {},
) {
  const onPage = vi.fn();
  const onPageSize = vi.fn();
  render(
    <TablePagination
      total={312}
      page={1}
      pageSize={10}
      onPage={onPage}
      onPageSize={onPageSize}
      noun="Top pages"
      {...props}
    />,
  );
  return { onPage, onPageSize };
}

describe("TablePagination (MISS-0195)", () => {
  it("renders nothing when every row fits 10", () => {
    const { container } = render(
      <TablePagination
        total={10}
        page={1}
        pageSize={10}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
        noun="Top pages"
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("is a labelled nav with a Rows per page select offering exactly 10, 50, 250", () => {
    setup();
    expect(
      screen.getByRole("navigation", { name: "Top pages pagination" }),
    ).toBeTruthy();
    const select = screen.getByRole("combobox", {
      name: "Rows per page",
    }) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "10",
      "50",
      "250",
    ]);
    expect(select.value).toBe("10");
  });

  it("shows the range with an en dash and thousands separators", () => {
    setup({ total: 1312, page: 2, pageSize: 250 });
    expect(screen.getByText("251–500 of 1,312")).toBeTruthy();
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { onPage } = setup();
    const prev = screen.getByRole("button", {
      name: "Previous page",
    }) as HTMLButtonElement;
    const next = screen.getByRole("button", {
      name: "Next page",
    }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(onPage).toHaveBeenCalledWith(2);
    cleanup();
    const last = setup({ page: 32 });
    expect(
      (screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(last.onPage).toHaveBeenCalledWith(31);
    expect(screen.getByText("311–312 of 312")).toBeTruthy();
  });

  it("clamps an out-of-range page in the range text", () => {
    setup({ total: 23, page: 9 });
    expect(screen.getByText("21–23 of 23")).toBeTruthy();
  });

  it("hides the arrows when every row fits the chosen size, keeps the size select", () => {
    setup({ total: 40, pageSize: 50 });
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Rows per page" }),
    ).toBeTruthy();
    expect(screen.getByText("1–40 of 40")).toBeTruthy();
  });

  it("reports a new page size", () => {
    const { onPageSize } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "250" },
    });
    expect(onPageSize).toHaveBeenCalledWith(250);
  });
});
