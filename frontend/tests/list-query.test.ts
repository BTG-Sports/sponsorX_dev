import { describe, expect, it } from "vitest";

import { apiListQuery, nextQuery, pageParams, rangeOf, textParam } from "../src/lib/list-query";

/* Server-paged lists — the URL rules (memory: pagination-pattern). */

describe("pageParams", () => {
  it("defaults to page 1 of 12 and only accepts the house sizes", () => {
    expect(pageParams({})).toEqual({ page: 1, size: 12 });
    expect(pageParams({ page: "3", size: "60" })).toEqual({ page: 3, size: 60 });
    expect(pageParams({ page: "-2", size: "7" })).toEqual({ page: 1, size: 12 });
    expect(pageParams({ page: ["2", "9"] })).toEqual({ page: 2, size: 12 });
  });
});

describe("apiListQuery", () => {
  it("always sends page + size (turning the endpoint's paged mode on) and drops empty extras", () => {
    expect(apiListQuery({ page: "2" }, { q: "show", state: "" })).toBe("?page=2&size=12&q=show");
  });
});

describe("nextQuery", () => {
  it("a page change keeps the filters", () => {
    expect(nextQuery("q=a&state=ACTIVE", { page: 3 })).toBe("?q=a&state=ACTIVE&page=3");
  });
  it("any other change resets to page 1", () => {
    expect(nextQuery("q=a&page=4", { state: "DRAFT" })).toBe("?q=a&state=DRAFT");
    expect(nextQuery("page=4&size=24", { size: 60 })).toBe("?size=60");
  });
  it("omits page and size at their defaults, and clears a filter on empty", () => {
    expect(nextQuery("size=24&page=2", { size: 12 })).toBe("");
    expect(nextQuery("q=a&page=2", { page: 1 })).toBe("?q=a");
    expect(nextQuery("q=a&state=X", { q: null })).toBe("?state=X");
  });
});

describe("rangeOf / textParam", () => {
  it("computes the visible range, 0–0 when empty", () => {
    expect(rangeOf({ page: 2, size: 12, total: 30, pages: 3 })).toEqual({ start: 13, end: 24 });
    expect(rangeOf({ page: 3, size: 12, total: 30, pages: 3 })).toEqual({ start: 25, end: 30 });
    expect(rangeOf({ page: 1, size: 12, total: 0, pages: 1 })).toEqual({ start: 0, end: 0 });
  });
  it("restricts to an allowed set", () => {
    expect(textParam({ state: "ACTIVE" }, "state", ["ACTIVE"])).toBe("ACTIVE");
    expect(textParam({ state: "BOGUS" }, "state", ["ACTIVE"])).toBe("");
  });
});

describe("two paged lists on one page", () => {
  const inv = { page: "ipage", size: "isize" };
  it("paging the second list leaves the first list's page alone", () => {
    expect(nextQuery("page=3", { ipage: 2 }, inv)).toBe("?page=3&ipage=2");
  });
  it("filtering the second list resets only its own page", () => {
    expect(nextQuery("page=3&ipage=4", { iq: "ban" }, inv)).toBe("?page=3&iq=ban");
    expect(nextQuery("page=3&ipage=4&isize=24", { isize: 12 }, inv)).toBe("?page=3");
  });
});
