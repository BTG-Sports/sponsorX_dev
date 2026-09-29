import { describe, expect, it } from "vitest";

import { deskApiExtras, deskQuery } from "../src/lib/applications-live";
import { apiListQuery } from "../src/lib/list-query";

/* --------------------------------------------------------------------------
   The live applications desk, server-paged (2026-09-29): the URL → list
   state → API query translation the server page does before it fetches.
   -------------------------------------------------------------------------- */

describe("deskQuery", () => {
  it("defaults to the review tab and no filters", () => {
    expect(deskQuery({})).toEqual({ tab: "review", q: "", sport: "", flag: "", sort: "" });
  });

  it("keeps known values, trimmed", () => {
    expect(
      deskQuery({ tab: "approved", q: "  shammah ", sport: "Soccer", flag: "aging", sort: "newest" }),
    ).toEqual({ tab: "approved", q: "shammah", sport: "Soccer", flag: "aging", sort: "newest" });
  });

  it("drops unknown tabs, flags and sorts — including the demo-only ones", () => {
    expect(deskQuery({ tab: "constructor", flag: "flagged", sort: "score" })).toEqual({
      tab: "review", q: "", sport: "", flag: "", sort: "",
    });
  });

  it("reads the first of a repeated param and bounds search length", () => {
    const d = deskQuery({ tab: ["rejected", "all"], q: "x".repeat(500) });
    expect(d.tab).toBe("rejected");
    expect(d.q).toHaveLength(100);
  });
});

describe("deskApiExtras → apiListQuery", () => {
  it("always sends page, size and the tab; omits empty extras", () => {
    const sp = { page: "3", size: "24", q: "md" };
    const qs = apiListQuery(sp, deskApiExtras(deskQuery(sp)));
    const u = new URLSearchParams(qs.slice(1));
    expect(Object.fromEntries(u)).toEqual({ page: "3", size: "24", tab: "review", q: "md" });
  });

  it("clamps an off-convention size to the default", () => {
    const sp = { size: "1000", tab: "all", flag: "minor" };
    const u = new URLSearchParams(apiListQuery(sp, deskApiExtras(deskQuery(sp))).slice(1));
    expect(Object.fromEntries(u)).toEqual({ page: "1", size: "12", tab: "all", flag: "minor" });
  });
});
