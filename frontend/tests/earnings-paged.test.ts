import { describe, expect, it } from "vitest";

import {
  activityExtras,
  agingBuckets,
  agingRows,
  codeToDay,
  pagedQuery,
  summaryBuckets,
  type ApiEarningsSummary,
} from "../src/lib/earnings-live";

/* --------------------------------------------------------------------------
   2026-09-29 — the server-paged earnings pages' pure helpers: the API query
   each list sends, the explorer's "May-10" URL dates turned into the API's
   days, and the summary / aging shapes drawn as the old in-browser totals
   were. A withheld amount stays a 0 on the drawing side only.
   -------------------------------------------------------------------------- */

describe("pagedQuery", () => {
  it("always sends page and size, then only non-empty extras", () => {
    expect(pagedQuery({ page: 2, size: 24 }, { q: "fall", state: "", type: "Reel" })).toBe("?page=2&size=24&q=fall&type=Reel");
    expect(pagedQuery({ page: 1, size: 12 })).toBe("?page=1&size=12");
  });
});

describe("codeToDay", () => {
  it("turns the explorer's URL date into an ISO day in the given year", () => {
    expect(codeToDay("May-10", 2026)).toBe("2026-05-10");
    expect(codeToDay("oct-3", 2027)).toBe("2027-10-03");
  });
  it.each(["", "May", "Foo-10", "Feb-30", "May-0", "2026-05-10"])("rejects %s", (code) => {
    expect(codeToDay(code, 2026)).toBe("");
  });
});

describe("activityExtras", () => {
  const f = { q: "", status: "", type: "", from: "", to: "" };
  it("maps the explorer's filters onto the API's", () => {
    expect(activityExtras({ q: " bowie ", status: "PAID", type: "Reel", from: "May-10", to: "May-18" }, 2026)).toEqual({
      q: "bowie", state: "PAID", type: "Reel", from: "2026-05-10", to: "2026-05-18",
    });
  });
  it("a lone from is that single day; a backwards or stray to is dropped as the explorer drops it", () => {
    expect(activityExtras({ ...f, from: "May-10" }, 2026)).toMatchObject({ from: "2026-05-10", to: "2026-05-10" });
    expect(activityExtras({ ...f, from: "May-10", to: "May-01" }, 2026)).toMatchObject({ from: "2026-05-10", to: "2026-05-10" });
    expect(activityExtras({ ...f, to: "May-18" }, 2026)).toMatchObject({ from: "", to: "" });
  });
  it("an unknown status is dropped, not sent", () => {
    expect(activityExtras({ ...f, status: "BOGUS" }, 2026).state).toBe("");
  });
});

describe("summaryBuckets", () => {
  it("fills every state, reading a withheld amount as 0 for drawing", () => {
    const s = {
      count: 3, deliverables: { verified: 0, total: 0 }, jobNames: [],
      byState: { PAID: { count: 2, amount: 9_000 }, HELD: { count: 1 } },
    } as unknown as ApiEarningsSummary;
    const b = summaryBuckets(s);
    expect(b.PAID).toEqual({ count: 2, amount: 9_000 });
    expect(b.HELD).toEqual({ count: 1, amount: 0 });
    expect(b.PENDING).toEqual({ count: 0, amount: 0 });
  });
});

describe("agingRows", () => {
  it("draws the API's bucket sums exactly as agingBuckets draws invoices", () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const recon = [{
      campaignId: "c", name: "Fall", sponsorName: "Bowie", contracted: 0, invoiced: 0, invoicePaid: 0, earningsRaised: 0, earningsPaid: 0,
      invoices: [
        { number: null, zohoInvoiceId: "a", status: "sent", amount: 10_000, paidAt: null, issuedAt: null, dueAt: null },
        { number: null, zohoInvoiceId: "b", status: "overdue", amount: 30_000, paidAt: null, issuedAt: null, dueAt: "2026-10-11T00:00:00Z" },
      ],
    }];
    expect(agingRows([10_000, 30_000, 0, 0])).toEqual(agingBuckets(recon, now));
    expect(agingRows([0, 0, 0, 0]).every((r) => r.value === 0)).toBe(true);
  });
});
