import { describe, expect, it } from "vitest";
import { filtersFromConfig, splitKeys, toggleKey } from "./filters";

describe("filters", () => {
  it("toggles keys in a comma list", () => {
    expect(toggleKey(undefined, "fra")).toBe("fra");
    expect(toggleKey("fra", "esp")).toBe("fra,esp");
    expect(toggleKey("fra,esp", "fra")).toBe("esp");
    expect(toggleKey("fra", "fra")).toBeUndefined();
    expect(splitKeys(" fra , ,esp")).toEqual(["fra", "esp"]);
  });

  it("round-trips the saved filter state and drops unknown or empty keys", () => {
    const state = {
      include_query: "^iptv",
      country: "fra,esp",
      device: "MOBILE",
    };
    expect(filtersFromConfig(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(
      filtersFromConfig({ include_page: "", evil: "x", country: 3 }),
    ).toEqual({});
    expect(filtersFromConfig(null)).toEqual({});
  });
});
