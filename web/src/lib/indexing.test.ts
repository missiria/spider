import { describe, expect, it } from "vitest";
import { ALL_KNOWN, isIndexedCoverage, pagesDelta, ratioDelta, scopeFromKey, scopeFromSearch, scopeKey, scopeLabel, scopeQuery } from "./indexing";

describe("indexing scope helpers", () => {
  it("labels each scope and never merges them", () => {
    expect(scopeLabel(ALL_KNOWN)).toBe("All known pages");
    expect(scopeLabel({ scope: "submitted", scope_detail: null })).toBe("All submitted pages");
    expect(scopeLabel({ scope: "sitemap", scope_detail: "https://a.test/sitemap.xml" })).toBe("Sitemap: https://a.test/sitemap.xml");
  });

  it("round-trips a scope through the select key and the query string", () => {
    const sm = { scope: "sitemap" as const, scope_detail: "https://a.test/post-sitemap.xml?x=1|2" };
    expect(scopeFromKey(scopeKey(sm))).toEqual(sm);
    expect(scopeFromSearch(scopeQuery(sm))).toEqual(sm);
    expect(scopeQuery(ALL_KNOWN)).toBe("");
    expect(scopeFromSearch("?scope=nope")).toEqual(ALL_KNOWN);
    expect(scopeFromSearch(scopeQuery({ scope: "submitted", scope_detail: null }))).toEqual({ scope: "submitted", scope_detail: null });
  });
});

describe("indexing numbers", () => {
  it("shows no delta without a previous report", () => {
    expect(pagesDelta(10, null)).toBe("—");
    expect(pagesDelta(10, 0)).toBe("+10");
    expect(pagesDelta(3, 10)).toBe("−7");
    expect(pagesDelta(5, 5)).toBe("0");
    expect(ratioDelta(90, 100)).toBeCloseTo(-0.1);
    expect(ratioDelta(5, 0)).toBeNull();
    expect(ratioDelta(5, null)).toBeNull();
  });

  it("recognises Google's indexed coverage states only", () => {
    expect(isIndexedCoverage("Submitted and indexed")).toBe(true);
    expect(isIndexedCoverage("Indexed, not submitted in sitemap")).toBe(true);
    expect(isIndexedCoverage("Crawled - currently not indexed")).toBe(false);
    expect(isIndexedCoverage("URL is unknown to Google")).toBe(false);
    expect(isIndexedCoverage(null)).toBe(false);
  });
});
