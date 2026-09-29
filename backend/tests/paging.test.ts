import { describe, expect, it } from "vitest";

import { allowedList, clampPage, pageRequest, readPage, searchTerm } from "../src/lib/paging";

/* The shared offset-paging recipe (2026-09-29). */

describe("pageRequest", () => {
  it("is null without ?page — the endpoint stays unpaged for old callers", () => {
    expect(pageRequest({})).toBeNull();
  });
  it("defaults to 12 and computes skip", () => {
    expect(pageRequest({ page: "3" })).toEqual({ page: 3, size: 12, skip: 24, take: 12 });
    expect(pageRequest({ page: "2", size: "60" })).toEqual({ page: 2, size: 60, skip: 60, take: 60 });
  });
  it("degrades hostile input instead of erroring", () => {
    expect(pageRequest({ page: "-4", size: "0" })).toEqual({ page: 1, size: 12, skip: 0, take: 12 });
    expect(pageRequest({ page: "x", size: "100000" })?.size).toBe(100);
    expect(pageRequest({ page: "1.5" })?.page).toBe(1);
  });
});

describe("clampPage / readPage", () => {
  it("answers an out-of-range page as the last page", () => {
    expect(clampPage({ page: 9, size: 12, skip: 96, take: 12 }, 30)).toEqual({ page: 3, size: 12, skip: 24, take: 12 });
  });
  it("counts first, reads the clamped window, and skips the read when empty", async () => {
    const reads: [number, number][] = [];
    const r = await readPage({ page: 5, size: 10, skip: 40, take: 10 }, async () => 23, async (s, t) => (reads.push([s, t]), ["x"]));
    expect(reads).toEqual([[20, 10]]);
    expect(r.page).toEqual({ page: 3, size: 10, total: 23, pages: 3 });
    const e = await readPage({ page: 1, size: 12, skip: 0, take: 12 }, async () => 0, async () => { throw new Error("no read"); });
    expect(e).toEqual({ rows: [], page: { page: 1, size: 12, total: 0, pages: 1 } });
  });
});

describe("searchTerm / allowedList", () => {
  it("trims, bounds and strips NUL", () => {
    expect(searchTerm({ q: "  show\u0000room " })).toBe("showroom");
    expect(searchTerm({ q: "   " })).toBeUndefined();
    expect(searchTerm({ q: "x".repeat(500) })?.length).toBe(100);
  });
  it("keeps only allowed values", () => {
    expect(allowedList("ACTIVE,BOGUS,DRAFT", ["ACTIVE", "DRAFT"] as const)).toEqual(["ACTIVE", "DRAFT"]);
    expect(allowedList(undefined, ["A"] as const)).toEqual([]);
  });
});
