// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CountryMap } from "./CountryMap";

const rows = [
  { key: "fra", clicks: 5, impressions: 100, ctr: 0.05, position: 7 },
  { key: "usa", clicks: 0, impressions: 220, ctr: 0, position: 9 },
];

describe("CountryMap", () => {
  it("shows the hovered country's GSC metrics, including zero clicks", () => {
    const { container } = render(<CountryMap rows={rows} />);
    const unitedStates = container.querySelector(
      'path[aria-label^="United States of America:"]',
    );
    expect(unitedStates).toBeTruthy();
    fireEvent.mouseEnter(unitedStates!);

    expect(screen.getByText("United States of America")).toBeTruthy();
    expect(screen.getByText("Impr.").parentElement?.textContent).toContain(
      "220",
    );
    expect(screen.getByText("CTR").parentElement?.textContent).toContain(
      "0.00%",
    );
  });

  it("keeps map selection usable by keyboard", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CountryMap rows={rows} selected={["fra"]} onSelect={onSelect} />,
    );
    const france = container.querySelector('path[aria-label^="France:"]');
    expect(france).toBeTruthy();

    expect(france?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(france!, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("fra");
  });
});
